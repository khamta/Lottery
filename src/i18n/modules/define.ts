import type { Locale } from "../config";

/** โครงสร้างเดียวกับต้นฉบับ แต่ค่าเป็น string ธรรมดา */
export type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

type OtherLocale = Exclude<Locale, "th">;

/**
 * ประกาศข้อความของ module ครบ 4 ภาษาในที่เดียว — ภาษาไทยเป็นต้นฉบับ
 * ภาษาอื่นขาดคีย์หรือมีคีย์เกิน TypeScript จะฟ้องทันที
 *
 * ```ts
 * export const ordersMessages = defineModuleMessages({
 *   th: { orders: { title: "คำสั่งซื้อ" } },
 *   lo: { orders: { title: "ຄຳສັ່ງຊື້" } },
 *   en: { orders: { title: "Orders" } },
 *   zh: { orders: { title: "订单" } },
 * });
 * ```
 */
export function defineModuleMessages<const T extends Record<string, Record<string, unknown>>>(
  messages: { th: T } & { [L in OtherLocale]: NoInfer<DeepString<T>> },
) {
  return messages;
}
