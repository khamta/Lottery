# Changelog

ทุก release ของ template — project ที่ merge อัปเดตให้อ่านหัวข้อ **ต้องทำใน project** ก่อนเสมอ
(วิธีรับอัปเดต: `docs/EXTENDING.md` หัวข้อ 4)

## 1.1.0 — 2026-09-24

แยกไฟล์ของ template (core) ออกจากไฟล์ของแต่ละระบบ (project) เพื่อให้ทุกระบบใช้รูปแบบเดียวกันและรับอัปเดตได้

### เพิ่ม
- `template.json` — รายการไฟล์ core / project / shared / example
- จุดต่อขยาย: `src/config/brand.tsx` (โลโก้), `src/styles/brand.css` (สี), `src/config/audit.ts` (ชื่อ entity ใน audit log)
- ข้อความของ module แยกไฟล์ละ module ครบ 4 ภาษา: `src/i18n/modules/` + `defineModuleMessages()`
- `bun run new:module <ชื่อ>` — สร้าง module ใหม่จาก `scaffold/module/`
- `bun run template:check` — ตรวจว่า project แก้ไฟล์ core หรือไม่
- `tests/conventions/` — ตรวจกฎใน AGENTS.md อัตโนมัติทุกครั้งที่ `bun test`
- `.gitattributes` — ใช้ LF ทุก project กัน merge ชนเพราะ line ending
- `docs/EXTENDING.md`

### เปลี่ยน
- ข้อความของ products ย้ายจาก `src/i18n/dictionaries/*.ts` ไป `src/i18n/modules/products.ts`
- คีย์ validation ของ products: `validation.productNameMin` → `products.validation.nameMin`,
  `validation.skuMin|skuPattern|priceNumber|priceMin|stockNumber|stockInt|stockMin` → `products.validation.*`
- type `Dictionary` ใน `dictionaries/th.ts` เปลี่ยนชื่อเป็น `CoreDictionary` (`Dictionary` ที่ export จาก `@/i18n/dictionaries` = core + module)
- `entityKey` ใน `audit-logs/types.ts` อ่านจาก `src/config/audit.ts`
- ปุ่มปิดของ `Dialog` / `Sheet` ใช้คีย์ `common.close` แทนข้อความไทยตายตัว

### ต้องทำใน project
- คีย์ที่ project เคยเพิ่มใน `src/i18n/dictionaries/*.ts` → ย้ายไปไฟล์ใน `src/i18n/modules/` แล้วคืนไฟล์ dictionaries เป็นของ template
- ถ้าเคยแก้โลโก้ใน `app-sidebar.tsx` / `app-header.tsx` / `(auth)/layout.tsx` → ย้ายไป `src/config/brand.tsx`
- ถ้าเคยแก้สีใน `globals.css` → ย้ายค่าไป `src/styles/brand.css`
- ถ้าเคยเพิ่ม entity ใน `audit-logs/types.ts` → ย้ายไป `src/config/audit.ts`
- action ที่ตั้งใจไม่บันทึก audit → ใส่ `@audit-exempt` พร้อมเหตุผลในคอมเมนต์

## 1.0.0

รุ่นแรก
