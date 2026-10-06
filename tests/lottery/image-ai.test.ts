import { describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";

import {
  AI_MODEL,
  AI_STRONG_MODEL,
  AiImageError,
  claudeFailure,
  escalationReason,
  isAiRead,
  readSlipImage,
  slipTextOf,
} from "@/lottery/image-ai";
import { resolveOcrModels } from "@/lottery/ai-models";
import { parseTicket } from "@/lottery/parser";

/**
 * เทสต์ตัวอ่านรูปด้วย Claude — ไม่เรียก API จริง ใช้ client ปลอมที่ตอบข้อความตามที่กำหนด
 * ตอบตามลำดับคำขอ (คำขอเกินจำนวนคำตอบ = ตอบซ้ำคำตอบสุดท้าย) · Error = คำขอนั้นล้ม
 */
type FakeReply = { text: string; stop_reason?: string } | Error;

function fakeClient(...replies: FakeReply[]) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          requests.push(params);
          const reply = replies[Math.min(requests.length, replies.length) - 1]!;
          return {
            finalMessage: async () => {
              if (reply instanceof Error) throw reply;
              return {
                model: params.model,
                stop_reason: reply.stop_reason ?? "end_turn",
                content: [{ type: "text", text: reply.text }],
              };
            },
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("slipTextOf — ข้อความที่โมเดลตอบ → ข้อความโพย", () => {
  test("ตัด code fence และบรรทัดว่าง", () => {
    expect(slipTextOf("```\n612=5\n\n  652=5 \n```")).toBe("612=5\n652=5");
  });

  test("NONE = ไม่ใช่รูปโพย → ข้อความว่าง", () => {
    expect(slipTextOf("NONE")).toBe("");
    expect(slipTextOf(" none \n")).toBe("");
  });
});

describe("readSlipImage", () => {
  test("ส่งรูปเป็น base64 พร้อม prompt ที่ cache ไว้ แล้วคืนข้อความโพย", async () => {
    const { client, requests } = fakeClient({ text: "612=5\n652=5\nລວມ10000" });

    const read = await readSlipImage(client, jpeg, "image/jpeg");

    expect(read).toEqual({ engine: "claude", model: AI_MODEL, text: "612=5\n652=5\nລວມ10000" });
    expect(isAiRead(read)).toBe(true);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.model).toBe(AI_MODEL);
    expect(request.system).toMatchObject([{ cache_control: { type: "ephemeral" } }]);
    expect(request.messages).toMatchObject([
      {
        role: "user",
        content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/4A==" } }, { type: "text" }],
      },
    ]);
  });

  test("ข้อความที่ได้ parser อ่านได้ทันที — ตัวที่ไม่แน่ใจ (?) ติดเป็น issue ให้คนตรวจ", async () => {
    const { client } = fakeClient({ text: "32=3*3\n2?=3*3\nລວມ12" });

    const { text } = await readSlipImage(client, jpeg, "image/jpeg");
    const parsed = parseTicket(text, { lakMultiplier: 1000 });

    expect(parsed.bets.map((bet) => `${bet.number} ${bet.position} ${bet.amount}`)).toEqual(["32 TOP 3000", "32 BOTTOM 3000"]);
    expect(parsed.issues.map((issue) => issue.code)).toContain("BAD_NUMBER");
  });

  test("ชนิดรูปที่ API ไม่รับ → AiImageError (ไม่ต้องลองใหม่)", async () => {
    const { client, requests } = fakeClient({ text: "" });

    await expect(readSlipImage(client, jpeg, "image/heic")).rejects.toBeInstanceOf(AiImageError);
    expect(requests).toHaveLength(0);
  });

  test("โมเดลปฏิเสธ / ข้อความยาวเกิน → AiImageError", async () => {
    await expect(readSlipImage(fakeClient({ text: "", stop_reason: "refusal" }).client, jpeg, "image/jpeg")).rejects.toBeInstanceOf(
      AiImageError,
    );
    await expect(
      readSlipImage(fakeClient({ text: "612=5", stop_reason: "max_tokens" }).client, jpeg, "image/jpeg"),
    ).rejects.toBeInstanceOf(AiImageError);
  });
});

describe.skipIf(!AI_STRONG_MODEL || AI_STRONG_MODEL === AI_MODEL)("readSlipImage — รุ่นถูกอ่านไม่ผ่าน → รุ่นแม่นอ่านซ้ำ", () => {
  const apiError = (status: number, type: string) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type, message: type } }, type, new Headers());

  test("escalationReason — อ่านครบและยอดรวมตรง = ผ่าน", () => {
    expect(escalationReason("612=5\n652=5\nລວມ10000")).toBeNull();
    expect(escalationReason("2?=3*3")).toBe("BAD_NUMBER");
    expect(escalationReason("612=5\n652=5\nລວມ99000")).toBe("TOTAL_MISMATCH");
    expect(escalationReason("")).toBe("no slip found");
    const long = Array.from({ length: 30 }, (_, i) => `${10 + i}=5`).join("\n");
    expect(escalationReason(long)).toBe("long slip without total");
    expect(escalationReason(`${long}\nລວມ150`)).toBeNull();
  });

  test("มีตัวที่ไม่แน่ใจ (?) → รุ่นแม่นอ่านซ้ำ ใช้ผลของรุ่นแม่น เก็บผลรุ่นแรกไว้เทียบ", async () => {
    const { client, requests } = fakeClient({ text: "32=3*3\n2?=3*3" }, { text: "32=3*3\n29=3*3" });

    const read = await readSlipImage(client, jpeg, "image/jpeg");

    expect(requests.map((request) => request.model)).toEqual([AI_MODEL, AI_STRONG_MODEL]);
    expect(read).toEqual({
      engine: "claude",
      model: AI_STRONG_MODEL,
      text: "32=3*3\n29=3*3",
      escalated: { model: AI_MODEL, reason: "BAD_NUMBER", text: "32=3*3\n2?=3*3" },
    });
  });

  test("onModel — แจ้งรุ่นก่อนเริ่มอ่านทุกรุ่น (หน้าโพยขึ้นว่ากำลังอ่านด้วยรุ่นไหน)", async () => {
    const { client } = fakeClient({ text: "2?=3*3" }, { text: "29=3*3" });
    const models: string[] = [];

    await readSlipImage(client, jpeg, "image/jpeg", { onModel: (model) => models.push(model) });

    expect(models).toEqual([AI_MODEL, AI_STRONG_MODEL]);
  });

  test("คนสั่งอ่านด้วย AI (strong) → รุ่นแม่นอ่านเลยครั้งเดียว", async () => {
    const { client, requests } = fakeClient({ text: "2?=3*3" });

    await readSlipImage(client, jpeg, "image/jpeg", { strong: true });

    expect(requests.map((request) => request.model)).toEqual([AI_STRONG_MODEL]);
  });

  test("รุ่นแรกข้อความยาวเกิน → รุ่นแม่นลองอีกที", async () => {
    const { client } = fakeClient({ text: "612=5", stop_reason: "max_tokens" }, { text: "612=5" });

    const read = await readSlipImage(client, jpeg, "image/jpeg");

    expect(read).toMatchObject({ model: AI_STRONG_MODEL, text: "612=5", escalated: { model: AI_MODEL } });
  });

  test("รุ่นแม่นติดต่อไม่ได้ → ใช้ผลของรุ่นแรก (โพยรอตรวจตามเดิม)", async () => {
    const { client } = fakeClient({ text: "2?=3*3" }, new Anthropic.APIConnectionError({ message: "fetch failed" }));

    expect(await readSlipImage(client, jpeg, "image/jpeg")).toEqual({ engine: "claude", model: AI_MODEL, text: "2?=3*3" });
  });

  test("รุ่นแม่นใช้ไม่ได้เพราะบัญชี/ชื่อรุ่นผิด → แจ้ง error ให้ worker พัก Claude", async () => {
    const { client } = fakeClient({ text: "2?=3*3" }, apiError(404, "not_found_error"));

    await expect(readSlipImage(client, jpeg, "image/jpeg")).rejects.toBeInstanceOf(Anthropic.NotFoundError);
  });
});

describe("claudeFailure — Claude อ่านไม่ได้แล้วรูปถัดไปจะใช้ Claude ต่อหรือพักไว้", () => {
  const apiError = (status: number, type: string, message = type) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, new Headers());

  test("เครดิตหมด / key ผิด / ชื่อรุ่นผิด → account (พักนาน ใช้บริการ OCR แทน)", () => {
    expect(claudeFailure(apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."))).toBe(
      "account",
    );
    expect(claudeFailure(apiError(402, "billing_error"))).toBe("account");
    expect(claudeFailure(apiError(401, "authentication_error"))).toBe("account");
    expect(claudeFailure(apiError(404, "not_found_error"))).toBe("account");
  });

  test("ล่ม / rate limit / ต่อเครือข่ายไม่ได้ → outage (พักสั้น ๆ)", () => {
    expect(claudeFailure(apiError(429, "rate_limit_error"))).toBe("outage");
    expect(claudeFailure(apiError(529, "overloaded_error"))).toBe("outage");
    expect(claudeFailure(new Anthropic.APIConnectionError({ message: "fetch failed" }))).toBe("outage");
    expect(claudeFailure(new Error("socket hang up"))).toBe("outage");
  });

  test("รูปนี้รูปเดียวมีปัญหา → image (รูปถัดไปยังใช้ Claude)", () => {
    expect(claudeFailure(apiError(400, "invalid_request_error", "image exceeds 5 MB maximum"))).toBe("image");
    expect(claudeFailure(new AiImageError("model refused to read the image"))).toBe("image");
  });
});

describe("readSlipImage — รุ่นที่แม่หวยเลือกเอง (models)", () => {
  test("ใช้รุ่นที่เลือกแทนค่าเริ่มต้น ทั้งรุ่นแรกและรุ่นอ่านซ้ำ", async () => {
    const { client, requests } = fakeClient({ text: "2?=3*3" }, { text: "23=3*3" });

    const read = await readSlipImage(client, jpeg, "image/jpeg", {
      models: { model: "claude-haiku-4-5-20251001", strongModel: "claude-sonnet-5-5" },
    });

    expect(requests.map((request) => request.model)).toEqual(["claude-haiku-4-5-20251001", "claude-sonnet-5-5"]);
    expect(read).toMatchObject({ model: "claude-sonnet-5-5", escalated: { model: "claude-haiku-4-5-20251001" } });
  });

  test("ไม่อ่านซ้ำ (strongModel ว่าง) → อ่านรุ่นเดียว แม้คนสั่งอ่านใหม่ (strong)", async () => {
    const { client, requests } = fakeClient({ text: "2?=3*3" });

    await readSlipImage(client, jpeg, "image/jpeg", { strong: true, models: { model: "claude-opus-5-5", strongModel: "" } });

    expect(requests.map((request) => request.model)).toEqual(["claude-opus-5-5"]);
  });
});

describe("resolveOcrModels — ค่าที่แม่หวยเลือก → รุ่นที่ใช้อ่านจริง", () => {
  test("อัตโนมัติ (null) / ไม่มีแม่หวย = รุ่นถูกก่อน แล้วรุ่นแม่น (env)", () => {
    const auto = { model: AI_MODEL, strongModel: AI_STRONG_MODEL };
    expect(resolveOcrModels(null)).toEqual(auto);
    expect(resolveOcrModels({ ocrModel: null })).toEqual(auto);
  });

  test("เลือกรุ่นเอง = รุ่นนั้นรุ่นเดียว ไม่อ่านซ้ำ", () => {
    expect(resolveOcrModels({ ocrModel: "claude-opus-5-5" })).toEqual({ model: "claude-opus-5-5", strongModel: "" });
  });

  test("รุ่นที่เลิกให้เลือกแล้ว → อัตโนมัติ (ตรงกับที่หน้าแม่หวยแสดง)", () => {
    expect(resolveOcrModels({ ocrModel: "claude-old-1" })).toEqual({
      model: AI_MODEL,
      strongModel: AI_STRONG_MODEL,
    });
  });
});
