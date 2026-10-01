# เริ่ม project ใหม่จาก template นี้

> หลักการ: ทุกระบบใช้รูปแบบเดียวกัน และต่อยอดผ่าน "จุดต่อขยาย" เท่านั้น เพื่อรับอัปเดตของ template ได้เสมอ
> อ่าน `docs/EXTENDING.md` ประกอบ

## 1. คัดลอกโดยยังเชื่อมกับ template

```bash
git clone <url ของ repo template> my-new-project
cd my-new-project
git remote rename origin template          # ไว้ดึงอัปเดตของ template ภายหลัง
git remote add origin <url ของ repo ใหม่>
bun install
```

> **อย่า** `rm -rf .git` — จะ merge อัปเดตของ template ไม่ได้อีก

แก้ชื่อใน:
- `package.json` → `name`
- `.env` → `NEXT_PUBLIC_APP_NAME`, `DATABASE_URL`, `AUTH_SECRET` (สุ่มใหม่)

## 2. ตั้งค่าอัตลักษณ์ (ใช้เวลา ~10 นาที) — แก้เฉพาะไฟล์ของ project

| จะเปลี่ยนอะไร | แก้ที่ไหน |
| --- | --- |
| สี / ความโค้ง | `src/styles/brand.css` (ดู `docs/THEMING.md`) |
| โลโก้ | `src/config/brand.tsx` |
| เมนู | `src/config/nav.ts` |
| ชื่อแอป / ธีมเริ่มต้น / เปิด-ปิดสมัครสมาชิก | `src/config/site.ts` |
| ถ้อยคำของ template (เช่น tagline หน้า login) | เขียนคีย์ทับในไฟล์ `src/i18n/modules/*.ts` |

ห้ามแก้ `globals.css`, `src/components/**`, `src/lib/*` ฯลฯ (ไฟล์ core — ดู `template.json`)

## 3. สร้าง module แรก

```bash
bun run new:module orders
```

แล้วทำตามขั้นตอนที่คำสั่งพิมพ์ออกมา (prisma model → ฟิลด์ → ถ้อยคำ 4 ภาษา → เมนู)
รายละเอียดกฎทั้งหมดอยู่ใน `AGENTS.md`

## 4. ตัด module ตัวอย่าง (products) เมื่อไม่ใช้แล้ว

```
ลบ src/app/(dashboard)/products/
ลบ src/lib/validations/product.ts
ลบ src/i18n/modules/products.ts        แล้วเอาออกจาก src/i18n/modules/index.ts
ลบ tests/server/product-actions.test.ts
ลบ Product ใน src/config/audit.ts
ลบ model Product / Category / enum ProductStatus ใน prisma/schema.prisma
ลบเมนู nav.products ใน src/config/nav.ts
```

`bun run new:module` ยังใช้ได้หลังลบ (แม่แบบอยู่ใน `scaffold/module/`)

## 5. รับอัปเดตของ template

```bash
git fetch template
bun run template:check
git merge template/main
bun install && bun run typecheck && bun test
```

## 6. Checklist ก่อนขึ้น production

- [ ] `AUTH_SECRET` เป็นค่าใหม่ที่สุ่มมา ไม่ใช้ซ้ำกับ project อื่น
- [ ] เปลี่ยนรหัสผ่านบัญชี seed หรือลบทิ้ง
- [ ] `bun run typecheck`, `bun test` และ `bun run build` ผ่าน (รวม `tests/conventions/`)
- [ ] `bun run template:check` ไม่มีไฟล์ core ที่ถูกแก้
- [ ] ใช้ `bun run db:migrate` (ไม่ใช่ `db:push`) บน production
