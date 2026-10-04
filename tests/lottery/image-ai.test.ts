import { describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";

import { AiImageError, claudeFailure, isAiRead, readSlipImage, slipTextOf } from "@/lottery/image-ai";
import { parseTicket } from "@/lottery/parser";

/**
 * เทสต์ตัวอ่านรูปด้วย Claude — ไม่เรียก API จริง ใช้ client ปลอมที่ตอบข้อความตามที่กำหนด
 */
type FakeReply = { text: string; stop_reason?: string };

function fakeClient(reply: FakeReply) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          requests.push(params);
          return {
            finalMessage: async () => ({
              model: "claude-opus-5-5",
              stop_reason: reply.stop_reason ?? "end_turn",
              content: [{ type: "text", text: reply.text }],
            }),
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

    expect(read).toEqual({ engine: "claude", model: "claude-opus-5-5", text: "612=5\n652=5\nລວມ10000" });
    expect(isAiRead(read)).toBe(true);
    const request = requests[0]!;
    expect(request.model).toBe("claude-opus-5-5");
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
