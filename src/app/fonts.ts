import { Noto_Sans_Lao, Noto_Sans_SC, Sarabun, Tinos } from "next/font/google";

/**
 * ============================================================================
 * ฟอนต์ — เลือกตาม "ตัวอักษร" ไม่ใช่ตามภาษาที่ผู้ใช้เลือก
 * ============================================================================
 * เบราว์เซอร์ไล่หาฟอนต์ใน font-family ทีละตัว *รายตัวอักษร*
 * ถ้าฟอนต์แรกไม่มี glyph ของตัวอักษรนั้นจะเลื่อนไปตัวถัดไปเอง
 * เราจึงเรียงชุดฟอนต์ตามลำดับนี้ครั้งเดียว แล้วได้ผลลัพธ์:
 *
 *   ອັກສອນລາວ   → Phetsarath OT   (ฟอนต์ก่อนหน้าไม่มีอักษรลาว)
 *   อักษรไทย     → Sarabun
 *   Latin/ตัวเลข → Times New Roman
 *   汉字          → Noto Sans SC
 *
 * ใช้ชุดเดียวทั้งระบบ — ข้อความลาวที่อยู่ในหน้าภาษาไทยก็ยังเป็น Phetsarath
 * และคำภาษาอังกฤษในหน้าภาษาลาวก็ยังเป็น Times New Roman
 */

export const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

/** สำรองของ Phetsarath OT เผื่อเครื่องผู้ใช้ไม่มีฟอนต์นั้นและไม่ได้วางไฟล์ไว้ */
export const notoLao = Noto_Sans_Lao({
  subsets: ["lao"],
  variable: "--font-noto-lao",
  display: "swap",
});

/** Tinos = metric ตรงกับ Times New Roman ใช้แทนบนเครื่องที่ไม่มี TNR (Linux/Android) */
export const tinos = Tinos({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-tinos",
  display: "swap",
});

export const notoSC = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto-sc",
  display: "swap",
});

export const fontVariables = [
  sarabun.variable,
  notoLao.variable,
  tinos.variable,
  notoSC.variable,
].join(" ");

/**
 * ลำดับสำคัญมาก — ฟอนต์ที่มี glyph ของอักษรไหน "ก่อน" จะได้ใช้กับอักษรนั้น
 * ห้ามเอา Sarabun ขึ้นก่อน Times New Roman ไม่งั้นตัวอักษรอังกฤษจะกลายเป็น Sarabun
 */
export const appFontStack = [
  // อังกฤษ / ตัวเลข / เครื่องหมายวรรคตอน
  `"Times New Roman"`,
  `var(--font-tinos)`,
  `Times`,
  // ไทย
  `var(--font-sarabun)`,
  // ลาว
  `"Phetsarath OT"`,
  `var(--font-noto-lao)`,
  // จีน (ถ้าเครื่องไม่มี Noto Sans SC จะใช้ฟอนต์จีนของระบบ)
  `var(--font-noto-sc)`,
  `"Microsoft YaHei"`,
  `"PingFang SC"`,
  `"Hiragino Sans GB"`,
  // อักษรอื่น ๆ ที่ไม่ได้ระบุไว้
  `system-ui`,
  `sans-serif`,
].join(", ");
