import { z } from "zod";

/**
 * ผลลัพธ์มาตรฐานของทุก server action ใน template นี้
 *
 * `message` เป็น "คีย์ i18n" เสมอ (เช่น "errors.conflict") ไม่ใช่ข้อความสำเร็จรูป
 * เพราะ server ไม่รู้ว่าผู้ใช้เลือกภาษาอะไร — ฝั่ง client จะแปลด้วย handleResult()
 */
export type ActionResult<TData = undefined> =
  | { ok: true; data: TData; message?: string }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
      code?: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "UNKNOWN";
    };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(
  message: string,
  code: NonNullable<Extract<ActionResult, { ok: false }>["code"]> = "UNKNOWN",
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, message, code, fieldErrors };
}

/**
 * ห่อ server action ให้ validate input ด้วย zod + แปลง error เป็นรูปแบบเดียวกันทั้งระบบ
 *
 *   export const createProduct = createAction(productSchema, async (input) => { ... })
 */
export function createAction<TSchema extends z.ZodTypeAny, TData>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>) => Promise<TData>,
  options?: { successMessage?: string },
) {
  return async (raw: z.input<TSchema>): Promise<ActionResult<TData>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "errors.validation",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    try {
      const data = await handler(parsed.data);
      return { ok: true, data, message: options?.successMessage };
    } catch (error) {
      return toActionError(error);
    }
  };
}

export function toActionError(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "UNAUTHORIZED")
    return { ok: false, code: "UNAUTHORIZED", message: "errors.unauthorized" };
  if (message === "FORBIDDEN")
    return { ok: false, code: "FORBIDDEN", message: "errors.forbidden" };

  // unique constraint ของ Prisma
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return { ok: false, code: "CONFLICT", message: "errors.conflict" };
  }

  // ข้อความที่หน้าตาเป็นคีย์ i18n (เช่น "auth.emailTaken") ให้ส่งต่อไปแปลฝั่ง client
  if (/^[a-z][A-Za-z]*(\.[A-Za-z]+)+$/.test(message)) {
    return { ok: false, code: "UNKNOWN", message };
  }

  console.error("[action]", error);
  return { ok: false, code: "UNKNOWN", message: "errors.unknown" };
}
