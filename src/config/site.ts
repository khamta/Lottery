export const siteConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "My App",
  description: "Lottery bet tally from WhatsApp group tickets",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** ธีมเริ่มต้น: "light" | "dark" | "system" */
  defaultTheme: "system" as const,
  /**
   * เปิด/ปิดหน้าสมัครสมาชิกจากที่เดียว
   * ปิดไว้ เพราะใครสมัครได้ก็จะเห็นและแก้โพย/ยอดของทุกคนได้ — บัญชีแรกสร้างด้วย bun run db:seed
   */
  enableRegister: false,
  pagination: { defaultPageSize: 10, pageSizeOptions: [10, 20, 50, 100] },
  /**
   * เขตเวลาที่ใช้แสดงวันที่/เวลาทั้งระบบ — ตายตัว ไม่ขึ้นกับเครื่อง server หรือเบราว์เซอร์
   * (ไม่งั้น server ที่รันเป็น UTC กับเบราว์เซอร์จะแสดงเวลาไม่ตรงกันและเกิด hydration mismatch)
   */
  timeZone: process.env.NEXT_PUBLIC_TIME_ZONE ?? "Asia/Vientiane",
  /** ค่าของแอปตอนติดตั้งลงเครื่อง (PWA) — ดู docs/PWA.md */
  pwa: {
    shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? "My App",
    /** หน้าแรกเมื่อเปิดจากไอคอนบนหน้าจอ */
    startUrl: "/dashboard",
    /** สีพื้นไอคอน/แถบหัวแอป — ให้ใกล้เคียง --primary ใน globals.css */
    brandColor: "#2563eb",
    backgroundColor: "#ffffff",
  },
};

export type SiteConfig = typeof siteConfig;
