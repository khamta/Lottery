/**
 * บอทอ่านโพยจากกลุ่ม WhatsApp — โปรเซสแยกจากเว็บ ต้องเปิดค้างไว้ตลอดช่วงรับโพย
 *
 *   docker compose up -d        (service "worker")
 *   bun run wa:worker           (รันบนเครื่องตอนพัฒนา — อย่ารันพร้อม container เพราะจะต่อบัญชีเดียวกันซ้อนกัน)
 *
 * บอทตัวเดียวดูแลได้หลายบัญชี WhatsApp — ทั้งหมดตั้งค่าจากหน้าเว็บ /whatsapp ไม่ต้องแก้ .env
 *
 *   เว็บเขียน "สิ่งที่ต้องการ" ลงตาราง whatsapp_accounts / whatsapp_groups
 *     enabled       ให้เชื่อมต่อบัญชีนี้ไหม
 *     command       LOGOUT (เลิกเชื่อมต่อ) · SYNC (อ่านรายชื่อกลุ่มใหม่)
 *     pairingPhone  ใช้รหัสจับคู่แทน QR
 *     group.dealerId  อ่านกลุ่มนี้เข้าแม่หวยไหน (null = ไม่อ่าน)
 *   บอทอ่านทุก POLL_MS แล้วทำตาม และเขียน "สถานะจริง" กลับ: status / qr / pairingCode / phone / รายชื่อกลุ่ม / seenAt
 *
 * session ของแต่ละบัญชีอยู่ใน WA_AUTH_DIR/<id ของบัญชี> (docker: volume wa-auth)
 * ใครได้โฟลเดอร์นี้ไปเท่ากับได้บัญชี WhatsApp ห้าม commit / ห้ามแชร์
 *
 * บอทอ่านอย่างเดียว ไม่ส่งข้อความเข้ากลุ่ม · ใช้การเชื่อมต่อ WhatsApp Web แบบไม่เป็นทางการ (Baileys)
 * จึงมีความเสี่ยงที่เบอร์จะถูกแบน — ควรใช้เบอร์แยกสำหรับบอท
 *
 * รูปโพย
 *   ลูกค้าส่งรูป (ลายมือ/แคปหน้าจอ) แทนข้อความ → บอทดาวน์โหลดรูปเป็นไฟล์ใน uploads/ (ฐานข้อมูลเก็บแค่ path) เป็นโพยรอตรวจทันที
 *   แล้วส่งเข้าคิวอ่านด้วย OCR (worker/ocr.ts · บริการ ocr ใน docker-compose) — อ่านเสร็จข้อความโพยขึ้นในโพยนั้นเอง
 *
 * ข้อความที่ถอดรหัสไม่ได้
 *   ข้อความในกลุ่มเข้ารหัสด้วยกุญแจของคนส่งแต่ละคน ข้อความแรก ๆ ของแต่ละคนหลังบอทเพิ่งเชื่อมต่อจึงมัก
 *   ถอดรหัสไม่ได้ในรอบแรก ไลบรารีจะขอให้ส่งใหม่เองและมักได้ข้อความภายในไม่กี่วินาที
 *   ถ้าเกิน UNDECRYPTED_WAIT_MS แล้วยังไม่ได้ บอทสร้าง "โพยรอตรวจที่ข้อความว่าง" ให้คนดูแชตแล้ววางข้อความเอง
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isPnUser,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
  toNumber,
  useMultiFileAuthState,
  type GroupMetadata,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { LotteryType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { removeTicketImage, saveTicketImage, sweepTicketImages, UPLOAD_ROOT } from "@/lottery/image-store";
import {
  editMessage,
  ingestImage,
  ingestMessage,
  ingestUndecryptable,
  revokeMessage,
  type IngestResult,
  type MessageSender,
} from "@/lottery/ingest";
import { enqueueOcr, resumeOcr } from "./ocr";

const AUTH_ROOT = resolve(process.env.WA_AUTH_DIR || ".wa-auth");
/** รอบการอ่านคำสั่ง/การผูกกลุ่มจากฐานข้อมูล — เปลี่ยนที่หน้าเว็บแล้วมีผลภายในเวลานี้ */
const POLL_MS = 3000;
/** หลุดแล้วรอเท่านี้ก่อนต่อใหม่ */
const RECONNECT_MS = 5000;
/** อ่านรายชื่อกลุ่มทั้งหมดใหม่เป็นระยะ (เผื่อพลาด event เปลี่ยนชื่อ/ออกจากกลุ่ม) */
const GROUP_RESYNC_MS = 30 * 60 * 1000;
/** รอข้อความที่ขอส่งใหม่นานเท่านี้ ก่อนส่งเข้าคิวรอตรวจให้คนดูแชตเอง */
const UNDECRYPTED_WAIT_MS = 60_000;
/** รูปใหญ่เกินนี้ไม่ใช่รูปโพย (WhatsApp ย่อรูปเหลือไม่เกินราว 2 MB) — บริการ OCR รับได้ไม่เกิน 15 MB */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** ลบไฟล์รูปของโพยที่ไม่มีแล้ว (ถูกลบ/รวม) ทุกเท่านี้ */
const IMAGE_SWEEP_MS = 24 * 60 * 60 * 1000;

const time = () => new Date().toLocaleTimeString("en-GB");
const log = (...args: unknown[]) => console.log(time(), ...args);

/** ข้อความ error ของการถอดรหัสข้อความกลุ่มที่เกิดได้ตามปกติ และไลบรารีขอส่งใหม่ให้เอง */
const DECRYPT_NOISE = /No session|No SenderKeyRecord|old counter|No sender message key|Bad MAC|Key used already/i;

const errorText = (value: unknown) =>
  value instanceof Error ? value.message : ((value as { message?: string } | null)?.message ?? String(value));

/** Baileys ต้องการ logger — ปิดเสียงทั้งหมด ยกเว้น error (ย่อ error การถอดรหัสที่คาดไว้ให้เหลือบรรทัดเดียว) */
function makeLogger(label: string) {
  const logger = {
    level: "error",
    child: () => logger,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (obj: unknown, msg?: string) => {
      const context = (obj ?? {}) as { key?: { id?: string }; err?: unknown; error?: unknown };
      const reason = errorText(context.err ?? context.error ?? "");

      if (msg === "failed to decrypt message") {
        return log(`[${label}] ถอดรหัสข้อความ ${context.key?.id ?? "?"} ไม่ได้ (${reason}) — ขอให้ส่งใหม่อัตโนมัติ`);
      }
      // บรรทัดนี้มาคู่กับ "failed to decrypt message" ของ error เดียวกัน
      if (msg === "transaction failed, rolling back" && DECRYPT_NOISE.test(reason)) return;

      console.error(`[${label}] [baileys]`, msg ?? "", obj);
    },
  };
  return logger;
}

// ------------------------------------------------------------------ สถานะในหน่วยความจำ

/** กลุ่มที่อ่าน: แม่หวยที่ผูกไว้ + id ของกลุ่ม (โพยจำว่ามาจากกลุ่มไหน) + ประเภทหวย (ลงงวดของประเภทนี้) */
type GroupTarget = { dealerId: string; groupId: string; lottery: LotteryType };

type Session = {
  id: string;
  label: string;
  sock: WASocket;
  /** jid ของกลุ่ม -> กลุ่ม + แม่หวยที่ผูกไว้ (เฉพาะกลุ่มที่อ่าน) — อ่านจากฐานข้อมูลทุก POLL_MS */
  groups: Map<string, GroupTarget>;
  connected: boolean;
  /** ตั้งเมื่อบอทปิดเองตั้งใจ (ลบบัญชี / ปิด / logout) — event close จะไม่ต่อใหม่ */
  stopping: boolean;
  lastGroupSync: number;
};

const sessions = new Map<string, Session>();
/** บัญชีที่เพิ่งหลุด — ห้ามเริ่มใหม่ก่อนเวลานี้ */
const retryAt = new Map<string, number>();
/** กันเริ่มบัญชีเดียวกันซ้อนระหว่างรอ fetchLatestBaileysVersion */
const starting = new Set<string>();

/** ข้อความที่ถอดรหัสไม่ได้และกำลังรอส่งใหม่ — จำคนส่งไว้ เพราะข้อความที่ได้คืนจากโทรศัพท์อาจไม่มีข้อมูลคนส่ง */
type Waiting = {
  label: string;
  target: GroupTarget;
  sender: MessageSender;
  sentAt?: Date;
  offline: boolean;
  timer: ReturnType<typeof setTimeout>;
};
const waiting = new Map<string, Waiting>();

const authDir = (id: string) => join(AUTH_ROOT, id);

/** บอทเขียนเฉพาะฟิลด์สถานะ — updateMany ไม่ throw ถ้าบัญชีถูกลบไปแล้ว */
async function report(id: string, data: Prisma.WhatsappAccountUpdateManyMutationInput) {
  await prisma.whatsappAccount.updateMany({ where: { id }, data }).catch((error) => {
    console.error(`บันทึกสถานะบัญชี ${id} ไม่สำเร็จ`, error);
  });
}

// ------------------------------------------------------------------ ข้อความ → โพย

function textOf(content: proto.IMessage | null | undefined) {
  const message = normalizeMessageContent(content);
  return message?.conversation ?? message?.extendedTextMessage?.text ?? null;
}

/** รูปในข้อความ — รูปปกติ หรือรูปที่ส่งแบบไฟล์ (เอกสาร) เพื่อไม่ให้ WhatsApp ย่อรูป */
function imageOf(content: proto.IMessage | null | undefined) {
  const message = normalizeMessageContent(content);
  const image = message?.imageMessage;
  if (image) return { mimeType: image.mimetype || "image/jpeg", caption: image.caption ?? "", size: toNumber(image.fileLength ?? 0) };
  const document = message?.documentMessage;
  if (document?.mimetype && /^image\/(jpeg|png|webp)$/.test(document.mimetype)) {
    return { mimeType: document.mimetype, caption: document.caption ?? "", size: toNumber(document.fileLength ?? 0) };
  }
  return null;
}

const sentAtOf = (message: WAMessage) =>
  message.messageTimestamp ? new Date(toNumber(message.messageTimestamp) * 1000) : undefined;

/** คนส่งในกลุ่ม — WhatsApp รุ่นใหม่ส่งมาเป็น LID (ไม่ใช่เบอร์) จึงต้องลองหาเบอร์จากหลายที่ */
async function senderOf(sock: WASocket, message: WAMessage): Promise<MessageSender> {
  const own = sock.user?.id;
  const jid = message.key.fromMe && own ? own : (message.key.participant ?? message.participant ?? null);
  // ไม่รู้คนส่ง → ใช้รหัสที่ไม่ซ้ำใคร กันข้อความของคนละคนถูกนับเป็นคนเดียวกัน
  if (!jid) return { senderId: `unknown:${message.key.id}`, senderPhone: null, senderName: null };

  let phoneJid = [jid, message.key.participantAlt].find((candidate) => isPnUser(candidate ?? undefined));
  if (!phoneJid) {
    phoneJid = (await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null)) ?? undefined;
  }
  const phone = phoneJid ? (jidDecode(phoneJid)?.user ?? null) : null;

  return { senderId: jidNormalizedUser(jid), senderPhone: phone, senderName: message.pushName ?? phone };
}

function describe(result: IngestResult) {
  if (result.action === "skipped") return `ข้าม (${result.reason})`;
  if (result.action === "revoked") return `ลบโพย ${result.ticketId}`;
  return `${result.action} ${result.ticketId} → ${result.status}`;
}

function reportIngest(label: string, sender: MessageSender, result: IngestResult) {
  if (result.action === "skipped" && result.reason === "not-ticket") return;
  log(`[${label}] ${sender.senderName ?? sender.senderId}:`, describe(result));
  if (result.action !== "skipped") return;
  if (result.reason === "no-open-draw") {
    console.warn("  ! แม่หวยของกลุ่มนี้ไม่มีงวดที่เปิดรับ ข้อความนี้ไม่ถูกบันทึก — เปิดงวดที่หน้า /draws");
  }
  if (result.reason === "before-draw") {
    console.warn("  ! ข้อความค้างส่งนี้ส่งมาก่อนงวดปัจจุบันเปิด จึงไม่ถูกบันทึก — ถ้าเป็นของงวดนี้ให้คีย์เอง");
  }
}

/** รอจนหมดเวลาแล้วข้อความจริงยังไม่มา → ส่งเข้าคิวรอตรวจ ไม่ปล่อยให้โพยหายเงียบ ๆ */
async function giveUp(id: string) {
  const entry = waiting.get(id);
  if (!entry) return;
  waiting.delete(id);

  try {
    const result = await ingestUndecryptable(prisma, {
      id,
      ...entry.target,
      ...entry.sender,
      sentAt: entry.sentAt,
      offline: entry.offline,
    });
    console.warn(
      `[${entry.label}] ! ข้อความ ${id} จาก ${entry.sender.senderName ?? entry.sender.senderId} ถอดรหัสไม่ได้ — ${describe(result)}` +
        (result.action === "undecryptable" ? " (ดูข้อความในแชตแล้ววางในโพยรอตรวจ)" : ""),
    );
  } catch (error) {
    console.error(`[${entry.label}] บันทึกข้อความที่ถอดรหัสไม่ได้ ${id} ไม่สำเร็จ — ต้องดูในแชตเอง`, error);
  }
}

async function handle(session: Session, target: GroupTarget, message: WAMessage, offline: boolean) {
  const { sock, label } = session;
  const id = message.key.id;
  if (!id) return;

  // ถอดรหัสไม่ได้ — ไลบรารีขอส่งใหม่ให้แล้ว ที่นี่แค่จับเวลารอ
  if (message.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT) {
    if (waiting.has(id)) return;
    waiting.set(id, {
      label,
      target,
      sender: await senderOf(sock, message),
      sentAt: sentAtOf(message),
      offline,
      timer: setTimeout(() => void giveUp(id), UNDECRYPTED_WAIT_MS),
    });
    return;
  }
  if (!message.message) return;

  // ข้อความจริงมาถึงแล้ว (ส่งใหม่สำเร็จ หรือได้คืนจากโทรศัพท์)
  const recovered = waiting.get(id);
  if (recovered) {
    clearTimeout(recovered.timer);
    waiting.delete(id);
  }

  const content = normalizeMessageContent(message.message);
  const protocol = content?.protocolMessage;

  // ลบ / แก้ข้อความเดิม
  if (protocol?.key?.id) {
    if (protocol.type === proto.Message.ProtocolMessage.Type.REVOKE) {
      return log(`[${label}] ลบข้อความ:`, describe(await revokeMessage(prisma, protocol.key.id)));
    }
    const edited = textOf(protocol.editedMessage);
    if (protocol.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && edited) {
      return log(`[${label}] แก้ข้อความ:`, describe(await editMessage(prisma, protocol.key.id, edited)));
    }
    return;
  }

  const image = imageOf(message.message);
  if (image) return handleImage(session, target, message, image, recovered?.sender, offline);

  const text = textOf(message.message);
  if (!text) return;

  const sender = recovered?.sender ?? (await senderOf(sock, message));
  reportIngest(label, sender, await ingestMessage(prisma, { id, ...target, text, ...sender, sentAt: sentAtOf(message), offline }));
}

/** รูปโพย → เก็บรูปเข้าระบบก่อน (โพยรอตรวจ) แล้วส่งเข้าคิว OCR */
async function handleImage(
  session: Session,
  target: GroupTarget,
  message: WAMessage,
  image: NonNullable<ReturnType<typeof imageOf>>,
  knownSender: MessageSender | undefined,
  offline: boolean,
) {
  const { sock, label } = session;
  const sender = knownSender ?? (await senderOf(sock, message));
  if (image.size > MAX_IMAGE_BYTES) {
    return log(`[${label}] ${sender.senderName ?? sender.senderId}: ข้ามรูปขนาด ${(image.size / 1024 / 1024).toFixed(1)} MB (ใหญ่เกิน)`);
  }

  // ไฟล์รูปบนเซิร์ฟเวอร์ WhatsApp หมดอายุได้ (ข้อความค้างส่งนาน ๆ) — ขอให้โทรศัพท์คนส่งอัปโหลดใหม่ให้เอง
  const data = await downloadMediaMessage(
    message,
    "buffer",
    {},
    { logger: makeLogger(label), reuploadRequest: sock.updateMediaMessage },
  );

  // ไฟล์ลงโฟลเดอร์ uploads ก่อน ฐานข้อมูลเก็บแค่ path — ไม่ได้ใช้ (ซ้ำ/ไม่มีงวดเปิด/ผิดพลาด) ลบทิ้ง
  const path = await saveTicketImage(new Uint8Array(data), image.mimeType);
  let used = false;
  try {
    const result = await ingestImage(prisma, {
      id: message.key.id!,
      ...target,
      ...sender,
      sentAt: sentAtOf(message),
      offline,
      image: { path, mimeType: image.mimeType },
      caption: image.caption,
    });
    reportIngest(label, sender, result);
    if (result.action === "image" || result.action === "recovered") {
      used = true;
      enqueueOcr(result.ticketId);
    }
  } finally {
    if (!used) await removeTicketImage(path).catch(() => undefined);
  }
}

/** ไฟล์รูปของโพยที่ถูกลบ/รวมไปแล้ว — ลบตอนบอทเริ่มและทุก IMAGE_SWEEP_MS */
async function sweepImages() {
  const removed = await sweepTicketImages(async (paths) => {
    const rows = await prisma.ticketImage.findMany({ where: { path: { in: paths } }, select: { path: true } });
    return new Set(rows.map((row) => row.path!));
  });
  if (removed > 0) log(`ลบไฟล์รูปโพยที่ไม่มีโพยแล้ว ${removed} ไฟล์`);
}

// ------------------------------------------------------------------ กลุ่ม

async function upsertGroup(accountId: string, group: Pick<GroupMetadata, "id" | "subject"> & { size?: number }) {
  const data = { name: group.subject || group.id, active: true, ...(group.size !== undefined ? { size: group.size } : {}) };
  await prisma.whatsappGroup.upsert({
    where: { accountId_jid: { accountId, jid: group.id } },
    update: data,
    create: { accountId, jid: group.id, ...data },
  });
}

/** บัญชี -> (jid ของกลุ่ม -> กลุ่ม + แม่หวย) เฉพาะกลุ่มที่เลือกแม่หวยไว้ */
async function loadGroupMap(accountIds: string[]) {
  const rows = await prisma.whatsappGroup.findMany({
    where: { accountId: { in: accountIds }, dealerId: { not: null } },
    select: { id: true, accountId: true, jid: true, dealerId: true, lottery: true },
  });
  const map = new Map<string, Map<string, GroupTarget>>();
  for (const row of rows) {
    if (!map.has(row.accountId)) map.set(row.accountId, new Map());
    map.get(row.accountId)!.set(row.jid, { dealerId: row.dealerId!, groupId: row.id, lottery: row.lottery });
  }
  return map;
}

/** อ่านรายชื่อกลุ่มทั้งหมดของบัญชีลงฐานข้อมูล — กลุ่มที่ออกไปแล้วเป็น active=false (คงการผูกแม่หวยไว้) */
async function syncGroups(session: Session) {
  const groups = Object.values(await session.sock.groupFetchAllParticipating());
  for (const group of groups) {
    await upsertGroup(session.id, { id: group.id, subject: group.subject, size: group.participants.length });
  }
  await prisma.whatsappGroup.updateMany({
    where: { accountId: session.id, jid: { notIn: groups.map((group) => group.id) } },
    data: { active: false },
  });
  session.lastGroupSync = Date.now();
  log(`[${session.label}] อ่านรายชื่อกลุ่มแล้ว ${groups.length} กลุ่ม`);
}

// ------------------------------------------------------------------ เชื่อมต่อ / ตัดการเชื่อมต่อ

async function start(account: { id: string; name: string; pairingPhone: string | null }) {
  if (sessions.has(account.id) || starting.has(account.id)) return;
  starting.add(account.id);

  try {
    const label = account.name;
    const logger = makeLogger(label);
    // โหลดการผูกกลุ่มก่อนต่อ — ข้อความค้างส่ง (append) มาถึงทันทีที่ต่อติด ก่อนวงรอบหลักรอบถัดไป
    const groups = await loadGroupMap([account.id]);
    const { state, saveCreds } = await useMultiFileAuthState(authDir(account.id));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      // cache กุญแจไว้ในหน่วยความจำ: อ่าน/เขียนไฟล์ทุกข้อความช้าและเสี่ยงอ่านกุญแจเก่าเมื่อข้อความเข้าติด ๆ กัน
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const session: Session = {
      id: account.id,
      label,
      sock,
      groups: groups.get(account.id) ?? new Map(),
      connected: false,
      stopping: false,
      lastGroupSync: 0,
    };
    sessions.set(account.id, session);
    const pairingPhone = (account.pairingPhone ?? "").replace(/\D/g, "");
    let pairingRequested = false;

    await report(account.id, { status: "STARTING", qr: null, pairingCode: null, lastError: null });
    log(`[${label}] เริ่มเชื่อมต่อ`);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        if (pairingPhone) {
          if (!pairingRequested) {
            pairingRequested = true;
            sock
              .requestPairingCode(pairingPhone)
              .then((code) => {
                log(`[${label}] ได้รหัสจับคู่แล้ว — ดูที่หน้าเว็บ`);
                return report(account.id, { status: "QR", qr: null, pairingCode: code });
              })
              .catch((error) => {
                console.error(`[${label}] ขอรหัสจับคู่ไม่สำเร็จ`, error);
                return report(account.id, { lastError: `pairing: ${errorText(error)}` });
              });
          }
        } else {
          void report(account.id, { status: "QR", qr, pairingCode: null });
        }
      }

      if (connection === "open") {
        session.connected = true;
        retryAt.delete(account.id);
        const me = sock.user;
        log(`[${label}] เชื่อมต่อ WhatsApp แล้ว`);
        void report(account.id, {
          status: "CONNECTED",
          qr: null,
          pairingCode: null,
          lastError: null,
          phone: me?.id ? (jidDecode(me.id)?.user ?? null) : null,
          waName: me?.name ?? me?.notify ?? null,
        });
        syncGroups(session).catch((error) => console.error(`[${label}] อ่านรายชื่อกลุ่มไม่สำเร็จ`, error));
      }

      if (connection === "close") {
        sessions.delete(account.id);
        if (session.stopping) return;

        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;

        // เลิกเชื่อมต่อจากโทรศัพท์ (อุปกรณ์ที่เชื่อมต่อ > ออกจากระบบ) → session ใช้ไม่ได้แล้ว ต้องสแกนใหม่
        if (status === DisconnectReason.loggedOut) {
          log(`[${label}] ถูกออกจากระบบ WhatsApp — ต้องสแกน QR ใหม่จากหน้าเว็บ`);
          void clearSession(account.id, "logged-out");
          return;
        }

        // ยังไม่เคยจับคู่ แล้ว QR หมดรอบ → หยุดไว้ รอผู้ใช้กด "เชื่อมต่อ" ใหม่ (ไม่ขึ้น QR วนไปเรื่อย ๆ)
        if (!state.creds.registered && status === DisconnectReason.timedOut) {
          log(`[${label}] QR หมดอายุ — รอกดเชื่อมต่อใหม่ที่หน้าเว็บ`);
          void report(account.id, {
            status: "DISCONNECTED",
            enabled: false,
            qr: null,
            pairingCode: null,
            lastError: "qr-timeout",
          });
          return;
        }

        // 515 = WhatsApp ขอให้ต่อใหม่ (เกิดเสมอหลังสแกน QR สำเร็จ) → ต่อทันที
        const delay = status === DisconnectReason.restartRequired ? 0 : RECONNECT_MS;
        log(`[${label}] การเชื่อมต่อหลุด (${status ?? "?"}) — ต่อใหม่ใน ${delay / 1000} วินาที`);
        retryAt.set(account.id, Date.now() + delay);
        void report(account.id, { status: "DISCONNECTED", qr: null, lastError: String(status ?? "unknown") });
      }
    });

    // เข้ากลุ่มใหม่ / กลุ่มเปลี่ยนชื่อ → อัปเดตรายชื่อทันที ไม่ต้องรอ sync รอบถัดไป
    sock.ev.on("groups.upsert", (groups) => {
      for (const group of groups) {
        upsertGroup(account.id, { id: group.id, subject: group.subject, size: group.participants.length }).catch(
          (error) => console.error(`[${label}] บันทึกกลุ่มใหม่ไม่สำเร็จ`, error),
        );
      }
    });
    sock.ev.on("groups.update", (updates) => {
      for (const update of updates) {
        if (!update.id || !update.subject) continue;
        prisma.whatsappGroup
          .updateMany({ where: { accountId: account.id, jid: update.id }, data: { name: update.subject } })
          .catch((error) => console.error(`[${label}] อัปเดตชื่อกลุ่มไม่สำเร็จ`, error));
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // "notify" = ข้อความสด · "append" = ข้อความที่ส่งมาระหว่างบอทออฟไลน์ (WhatsApp ส่งตามมาตอนต่อใหม่)
      // ประวัติแชตเก่าไม่ได้มาทางนี้ (syncFullHistory: false) — ข้อความค้างส่งที่เก่ากว่างวดปัจจุบันถูกกันที่ ingest
      for (const message of messages) {
        const target = message.key.remoteJid ? session.groups.get(message.key.remoteJid) : undefined;
        if (!target) continue; // กลุ่มที่ไม่ได้เลือกแม่หวย = ไม่อ่าน
        try {
          await handle(session, target, message, type !== "notify");
        } catch (error) {
          // ข้อความเดียวพังต้องไม่ทำให้บอทหยุดอ่านข้อความถัดไป
          console.error(`[${label}] นำเข้าข้อความ ${message.key.id} ไม่สำเร็จ`, error);
        }
      }
    });
  } catch (error) {
    console.error(`[${account.name}] เริ่มเชื่อมต่อไม่สำเร็จ`, error);
    retryAt.set(account.id, Date.now() + RECONNECT_MS);
    await report(account.id, { status: "DISCONNECTED", lastError: errorText(error).slice(0, 200) });
  } finally {
    starting.delete(account.id);
  }
}

/** ปิดการเชื่อมต่อโดยตั้งใจ — logout=true จะลบอุปกรณ์ออกจาก WhatsApp ด้วย (ต้องสแกนใหม่) */
async function stop(session: Session, logout: boolean) {
  session.stopping = true;
  sessions.delete(session.id);
  try {
    if (logout) await session.sock.logout();
    else session.sock.end(undefined);
  } catch (error) {
    console.error(`[${session.label}] ปิดการเชื่อมต่อไม่สำเร็จ`, errorText(error));
    session.sock.end(undefined);
  }
}

/** ลบ session ทิ้ง (ต้องสแกน QR ใหม่) แล้วรายงานว่าเลิกเชื่อมต่อแล้ว */
async function clearSession(id: string, reason: string) {
  await rm(authDir(id), { recursive: true, force: true }).catch(() => undefined);
  await report(id, {
    status: "LOGGED_OUT",
    enabled: false,
    command: null,
    qr: null,
    pairingCode: null,
    phone: null,
    waName: null,
    lastError: reason,
  });
}

// ------------------------------------------------------------------ วงรอบหลัก

async function tick() {
  const accounts = await prisma.whatsappAccount.findMany({
    select: { id: true, name: true, enabled: true, command: true, pairingPhone: true },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));

  // บัญชีถูกลบจากหน้าเว็บ → เลิกเชื่อมต่อเบอร์นั้นและลบ session
  for (const session of [...sessions.values()]) {
    if (byId.has(session.id)) continue;
    log(`[${session.label}] บัญชีถูกลบ — เลิกเชื่อมต่อ`);
    await stop(session, true);
    await rm(authDir(session.id), { recursive: true, force: true }).catch(() => undefined);
  }

  for (const account of accounts) {
    const session = sessions.get(account.id);

    if (account.command === "LOGOUT") {
      log(`[${account.name}] เลิกเชื่อมต่อตามคำสั่งจากหน้าเว็บ`);
      if (session) await stop(session, true);
      await clearSession(account.id, "logout");
      continue;
    }

    if (account.command === "SYNC") {
      await prisma.whatsappAccount.updateMany({ where: { id: account.id, command: "SYNC" }, data: { command: null } });
      if (session?.connected) {
        await syncGroups(session).catch((error) => console.error(`[${account.name}] อ่านรายชื่อกลุ่มไม่สำเร็จ`, error));
      }
    }

    if (!account.enabled) {
      if (session) {
        log(`[${account.name}] หยุดเชื่อมต่อ`);
        await stop(session, false);
        await report(account.id, { status: "DISCONNECTED", qr: null, pairingCode: null });
      }
      continue;
    }

    if (!session && (retryAt.get(account.id) ?? 0) <= Date.now()) {
      void start(account);
    }

    if (session?.connected && Date.now() - session.lastGroupSync > GROUP_RESYNC_MS) {
      await syncGroups(session).catch((error) => console.error(`[${account.name}] อ่านรายชื่อกลุ่มไม่สำเร็จ`, error));
    }
  }

  // กลุ่มที่ผูกกับแม่หวย — เปลี่ยนที่หน้าเว็บแล้วมีผลรอบถัดไป
  if (sessions.size > 0) {
    const groups = await loadGroupMap([...sessions.keys()]);
    for (const session of sessions.values()) session.groups = groups.get(session.id) ?? new Map();
  }

  // บอกหน้าเว็บว่าบอทยังทำงานอยู่ (SQL ตรง เพื่อไม่ให้ updatedAt ขยับทุกรอบ)
  await prisma.$executeRaw`UPDATE "whatsapp_accounts" SET "seenAt" = NOW()`;
}

async function loop() {
  try {
    await tick();
  } catch (error) {
    console.error("อ่านคำสั่งจากฐานข้อมูลไม่สำเร็จ", errorText(error));
  }
  setTimeout(loop, POLL_MS);
}

/** docker stop / Ctrl+C → ปิดทุกการเชื่อมต่อแบบไม่ logout (session ยังใช้ต่อได้เมื่อเปิดใหม่) */
async function shutdown(signal: string) {
  log(`ได้รับ ${signal} — ปิดบอท`);
  const ids = [...sessions.keys()];
  for (const session of [...sessions.values()]) await stop(session, false);
  await prisma.whatsappAccount
    .updateMany({ where: { id: { in: ids } }, data: { status: "DISCONNECTED", qr: null, lastError: "worker-stopped" } })
    .catch(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ต่อฐานข้อมูลไม่ได้ = ข้อความทุกข้อความจะหาย จึงหยุดตั้งแต่ต้น
await prisma.whatsappAccount.count().catch((error) => {
  console.error("เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจ DATABASE_URL", error);
  process.exit(1);
});

log(`บอท WhatsApp เริ่มทำงาน — session อยู่ที่ ${AUTH_ROOT} · รูปโพยอยู่ที่ ${UPLOAD_ROOT} · ตั้งค่าบัญชีที่หน้าเว็บ /whatsapp`);
void loop();
await resumeOcr(log).catch((error) => console.error("[OCR] อ่านรายการรูปค้างอ่านไม่สำเร็จ", error));
const sweep = () => sweepImages().catch((error) => console.error("ลบไฟล์รูปโพยที่ไม่มีโพยแล้วไม่สำเร็จ", error));
void sweep();
setInterval(sweep, IMAGE_SWEEP_MS);
