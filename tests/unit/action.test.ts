import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createAction, fail, ok, toActionError } from "@/lib/action";

const schema = z.object({ name: z.string().min(2) });

describe("createAction", () => {
  test("คืน ok:true พร้อม data และ successMessage", async () => {
    const action = createAction(schema, async (input) => ({ echo: input.name }), {
      successMessage: "บันทึกแล้ว",
    });

    const result = await action({ name: "สมชาย" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.echo).toBe("สมชาย");
      expect(result.message).toBe("บันทึกแล้ว");
    }
  });

  test("input ไม่ผ่าน schema → code VALIDATION พร้อม fieldErrors", async () => {
    const action = createAction(schema, async () => "ไม่ควรถูกเรียก");

    const result = await action({ name: "ก" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION");
      expect(result.fieldErrors?.name).toBeDefined();
    }
  });

  test("handler ไม่ถูกเรียกเมื่อ validate ไม่ผ่าน", async () => {
    let called = false;
    const action = createAction(schema, async () => {
      called = true;
      return null;
    });

    await action({ name: "" });
    expect(called).toBe(false);
  });

  test("handler โยน UNAUTHORIZED → คืนคีย์ i18n ให้ client แปล", async () => {
    const action = createAction(schema, async () => {
      throw new Error("UNAUTHORIZED");
    });

    const result = await action({ name: "สมชาย" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHORIZED");
      expect(result.message).toBe("errors.unauthorized");
    }
  });
});

describe("toActionError", () => {
  test("แปลง Prisma P2002 เป็น CONFLICT", () => {
    const result = toActionError({ code: "P2002" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("FORBIDDEN", () => {
    const result = toActionError(new Error("FORBIDDEN"));
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  test("ข้อความที่เป็นคีย์ i18n ถูกส่งต่อไปแปลฝั่ง client", () => {
    const result = toActionError(new Error("auth.emailTaken"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("auth.emailTaken");
  });

  test("error อื่น ๆ เป็น UNKNOWN", () => {
    const original = console.error;
    console.error = () => {}; // toActionError log error จริงไว้ดู — ปิดเสียงเฉพาะเทสต์นี้
    const result = toActionError(new Error("boom"));
    console.error = original;

    if (!result.ok) expect(result.code).toBe("UNKNOWN");
  });
});

describe("helper ok/fail", () => {
  test("ok", () => {
    expect(ok({ id: 1 }, "ดีแล้ว")).toEqual({ ok: true, data: { id: 1 }, message: "ดีแล้ว" });
  });

  test("fail", () => {
    const result = fail("ไม่มีสิทธิ์", "FORBIDDEN");
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
  });
});
