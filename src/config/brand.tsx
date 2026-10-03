import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * โลโก้ของแอป — ไฟล์นี้เป็นของ project (แก้ได้อิสระ ไม่ชนกับการอัปเดต template)
 * ใช้ใน sidebar, แถบบนบนมือถือ, หน้า login, ม่านโหลด และ splash
 *
 * รูปจริงอยู่ที่ public/img/logo.png (ต้นฉบับ) — ในแอปใช้ตัวย่อขนาดที่ siteConfig.pwa.logo
 * ขนาดส่งมาทาง className (size-4 / size-5 / size-7) ส่วนกรอบรอบโลโก้เป็นสี primary ของธีม
 * (bg-primary / bg-sidebar-primary ที่ผู้เรียกใส่) โลโก้จึงขยายให้เต็มกรอบมากขึ้นด้วย scale-150
 */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/img/logo-256.png"
      alt=""
      aria-hidden
      width={128}
      height={128}
      priority
      className={cn("size-4 scale-150 object-contain drop-shadow-sm", className)}
    />
  );
}
