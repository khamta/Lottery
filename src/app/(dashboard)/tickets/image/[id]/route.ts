import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccess, ownerScope } from "@/lottery/access";
import { autoAdjustSlipImage } from "@/lottery/image-enhance";
import { readTicketImage } from "@/lottery/image-store";

/** รูปแบบรูปที่เปิดในเบราว์เซอร์ได้อย่างปลอดภัย — SVG/HTML ห้ามเสิร์ฟเป็นรูป (มีสคริปต์ได้) */
const SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * เสิร์ฟรูปโพยให้คนตรวจเทียบกับข้อความ — id = รหัสโพย · ไฟล์อยู่ใน uploads (path ใน ticket_images)
 * ไม่วางรูปไว้ใน public/ เพราะต้องตรวจสิทธิ์ก่อนทุกครั้ง
 * เห็นได้เฉพาะโพยของแม่หวยที่ตัวเองเป็นเจ้าของ (ผู้ดูแลระบบเห็นทุกแม่หวย) เหมือนหน้าโพย
 * ?original=1 = รูปต้นฉบับก่อนคนแก้ (ยังไม่เคยแก้ = รูปปัจจุบัน)
 * รูปต้นฉบับส่งตามที่ได้รับ ไม่ปรับ (IMAGE_AUTO_ADJUST=1 = หมึกเข้ม/หนาขึ้น — image-enhance.ts) · รูปที่คนแก้แล้วส่งตามที่แก้
 * &raw=1 = ไฟล์ตามที่เก็บไว้ ไม่ปรับ (ปุ่มดูต้นฉบับในหน้าตรวจ)
 * ไฟล์แต่ละไฟล์ไม่เปลี่ยนหลังเก็บแล้ว จึง cache ได้ยาว — แก้รูปแล้ว URL เปลี่ยนตาม ?v= (ticketImageUrl)
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const access = await findAccess(session.user.id);
  if (!access) return new Response(null, { status: 403 });

  const { id } = await params;
  const image = await prisma.ticketImage.findFirst({
    where: { ticketId: id, ticket: { draw: { dealer: ownerScope(access) } } },
    select: { path: true, originalPath: true, mimeType: true },
  });
  const { searchParams } = new URL(request.url);
  const original = searchParams.get("original") === "1";
  const raw = searchParams.get("raw") === "1";
  const path = original ? (image?.originalPath ?? image?.path) : image?.path;
  const stored = path ? await readTicketImage(path) : null;
  if (!image || !stored) return new Response(null, { status: 404 });
  const edited = !!image.originalPath && path !== image.originalPath;
  const data = edited || raw ? stored : (await autoAdjustSlipImage(stored, sniffType(stored) ?? image.mimeType)).data;

  return new Response(new Uint8Array(data), {
    headers: {
      // ชนิดจริงดูจากไฟล์ (รูปต้นฉบับกับรูปที่แก้อาจเป็นคนละชนิด) — ไม่รู้จัก = ตามที่บันทึกไว้
      "Content-Type": sniffType(data) ?? (SAFE_TYPES.has(image.mimeType) ? image.mimeType : "application/octet-stream"),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** ชนิดรูปจากไบต์แรกของไฟล์ — ไม่รู้จัก = null */
function sniffType(data: Uint8Array) {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "image/webp";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  return null;
}
