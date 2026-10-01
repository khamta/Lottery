# CLAUDE.md

กติกาทั้งหมดของโปรเจกต์นี้อยู่ใน [`AGENTS.md`](AGENTS.md) — อ่านไฟล์นั้นก่อนเขียนโค้ดเสมอ

สรุปสั้น ๆ:

- ดึงข้อมูลที่ server component + แบ่งหน้าที่ฐานข้อมูลด้วย `paginate()` (`src/lib/query.ts`)
- สถานะตาราง (page / pageSize / q / sort / order) อยู่ใน URL — ค่าเริ่มต้น 10 รายการต่อหน้า
- เขียนข้อมูลผ่าน `createAction()` และเรียกจาก UI ด้วย `useOptimisticList().mutate()` เท่านั้น
- ข้อความทุกตัวเป็นคีย์ i18n และต้องแปลครบ 4 ภาษา (th / lo / en / zh) — ข้อความของ module อยู่ใน `src/i18n/modules/<module>.ts`
- สร้าง module ใหม่ด้วย `bun run new:module <ชื่อ>` (แม่แบบคือ module `products`) — ห้าม copy โฟลเดอร์เอง
- **ห้ามแก้ไฟล์ core ของ template** (รายการใน `template.json`) — ต่อยอดผ่าน `src/config/*`, `src/styles/brand.css`,
  `src/i18n/modules/*` และ module ของตัวเอง (ดู `docs/EXTENDING.md`)
- ก่อนส่งงาน: `bun run typecheck && bun test` (`tests/conventions/` ตรวจว่าทุก module ยังตรงรูปแบบ)
