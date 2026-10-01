# ใช้ template กับหลายระบบ — รูปแบบเดียวกัน ต่อยอดได้เอง

เป้าหมาย: ทุกระบบที่สร้างจาก template นี้มีโครงสร้าง, UI, การเขียนข้อมูล, audit log, i18n และมือถือ **แบบเดียวกัน**
แต่ละระบบเพิ่ม module / เปลี่ยนแบรนด์ / เปลี่ยนถ้อยคำได้เอง **โดยไม่แก้ไฟล์ของ template**
จึงรับอัปเดตของ template (แก้บั๊ก, ฟีเจอร์กลางใหม่) ได้ด้วย `git merge` ตลอดอายุของระบบ

---

## 1. ไฟล์ของใคร — core / project

รายการเต็มอยู่ใน [`template.json`](../template.json)

| ประเภท | ความหมาย | ตัวอย่าง |
| --- | --- | --- |
| **core** | ของ template — **ห้ามแก้ใน project** ถ้าต้องแก้ ให้แก้ที่ repo template แล้ว merge ลงมา | `src/lib/*`, `src/components/**`, `src/hooks/**`, `src/i18n/dictionaries/**`, `tests/conventions/**`, `AGENTS.md` |
| **project** | ของแต่ละระบบ — แก้ได้อิสระ template จะไม่แตะ | `src/config/**`, `src/styles/brand.css`, `src/i18n/modules/*`, `src/app/(dashboard)/<module>/`, `prisma/seed.ts` |
| **shared** | ทั้งสองฝ่ายแก้ได้ — อาจต้อง resolve conflict ตอน merge | `prisma/schema.prisma`, `package.json`, `README.md` |
| **example** | module ตัวอย่าง (products) — เก็บไว้ดูหรือลบทิ้งก็ได้ | `src/app/(dashboard)/products/**` |

ตรวจว่าเผลอแก้ไฟล์ core หรือไม่: `bun run template:check`

---

## 2. จุดต่อขยาย — อยากเปลี่ยนอะไร แก้ที่ไหน

| อยากเปลี่ยน | แก้ที่ (ไฟล์ของ project) |
| --- | --- |
| ชื่อแอป, ธีมเริ่มต้น, เปิด/ปิดสมัครสมาชิก, จำนวนต่อหน้า, เขตเวลา, PWA | `src/config/site.ts` (+ `.env`) |
| โลโก้ (sidebar, แถบบนมือถือ, หน้า login, ม่านโหลด) | `src/config/brand.tsx` → `BrandIcon` |
| สีแบรนด์ / ความโค้ง / ชุดสีสำเร็จรูป | `src/styles/brand.css` (โหลดต่อจาก `globals.css`) |
| เมนู (sidebar + แถบล่างมือถือพร้อมกัน) | `src/config/nav.ts` |
| ชื่อประเภทข้อมูลในหน้าประวัติการใช้งาน | `src/config/audit.ts` |
| ข้อความของ module (4 ภาษา) | `src/i18n/modules/<module>.ts` + ลงทะเบียนใน `src/i18n/modules/index.ts` |
| ถ้อยคำของ template เช่น tagline หน้า login | เขียนคีย์เดิมทับในไฟล์ข้อความของ module (ระบบ deep-merge ให้ ไม่ต้องแก้ `dictionaries/`) |
| หน้า dashboard | `src/app/(dashboard)/dashboard/` |
| ตาราง/model ของระบบ | `prisma/schema.prisma` — เพิ่ม model ของ project **ใต้** model ของ template |

### ข้อความของ module

```ts
// src/i18n/modules/orders.ts
import { defineModuleMessages } from "./define";

export const ordersMessages = defineModuleMessages({
  th: { nav: { orders: "คำสั่งซื้อ" }, orders: { title: "คำสั่งซื้อ" }, auditLogs: { entityOrder: "คำสั่งซื้อ" } },
  lo: { nav: { orders: "ຄຳສັ່ງຊື້" }, orders: { title: "ຄຳສັ່ງຊື້" }, auditLogs: { entityOrder: "ຄຳສັ່ງຊື້" } },
  en: { nav: { orders: "Orders" }, orders: { title: "Orders" }, auditLogs: { entityOrder: "Order" } },
  zh: { nav: { orders: "订单" }, orders: { title: "订单" }, auditLogs: { entityOrder: "订单" } },
});
```

- ภาษาไทยเป็นต้นฉบับ — ภาษาอื่นขาด/เกินคีย์ TypeScript ฟ้องทันที
- ข้อความของ module อยู่ใต้ namespace ของตัวเอง (`orders.*`, กฎ zod ใช้ `orders.validation.*`)
  เติมเข้า namespace กลางได้เฉพาะ `nav.*` และ `auditLogs.entity*`
- ใช้ได้ทันทีด้วย `t("orders.title")` ทั้ง client และ server

---

## 3. สร้าง module ใหม่

```bash
bun run new:module orders
bun run new:module purchase-orders
bun run new:module people --singular person
```

สร้างให้ครบตามมาตรฐาน: `page / loading / types / actions / _components (view, columns, dialog)`
+ zod schema + ไฟล์ข้อความ 4 ภาษา + เทสต์ server action + ลงทะเบียนข้อความและ audit entity
แล้วพิมพ์ขั้นตอนที่เหลือ (prisma model, ฟิลด์, ถ้อยคำ, เมนู)

แม่แบบมาจาก `scaffold/module/` (สำเนาของ products) — ใช้ได้แม้ project จะลบ products ทิ้งแล้ว

---

## 4. เชื่อม project กับ template และรับอัปเดต

### เริ่ม project ใหม่

```bash
git clone <url ของ repo template> my-system
cd my-system
git remote rename origin template     # เก็บ template ไว้เป็น remote ชื่อ template
git remote add origin <url ของ repo ระบบใหม่>
git push -u origin main
bun install
```

> **อย่า** `rm -rf .git` — ถ้าตัดประวัติทิ้ง จะ merge อัปเดตของ template ไม่ได้อีก

### รับอัปเดตของ template

```bash
git fetch template
bun run template:check                # ดูว่า project เผลอแก้ไฟล์ core ไปไหม
git merge template/main               # หรือ tag เช่น template/v1.2.0
bun install && bun run typecheck && bun test
```

อ่าน `CHANGELOG.md` ก่อน merge — หัวข้อ "ต้องทำใน project" บอกสิ่งที่ต้องปรับเอง
ไฟล์ core จะ merge สะอาดถ้า project ไม่ได้แก้ ส่วนไฟล์ shared (`schema.prisma`, `package.json`) อาจต้อง resolve เอง

### project เดิมที่สร้างด้วยการ copy (ไม่มีประวัติร่วม)

ทำครั้งเดียว แล้วหลังจากนั้นใช้ขั้นตอนปกติด้านบน:

```bash
git remote add template <url ของ repo template>
git fetch template
git merge template/main --allow-unrelated-histories   # resolve conflict ครั้งแรก
```

ระหว่าง resolve: ไฟล์ core ให้ใช้ของ template (`git checkout --theirs <file>`)
แล้วย้ายสิ่งที่ project เคยแก้ในไฟล์ core ไปไว้ที่จุดต่อขยายในหัวข้อ 2

---

## 5. สิ่งที่ถูกตรวจอัตโนมัติทุกครั้งที่ `bun test`

`tests/conventions/` ตรวจโค้ด **ทุก module รวมถึงที่ project เพิ่มเอง** ว่ายังตรงตาม `AGENTS.md`:

| ตรวจอะไร | ขอบเขต |
| --- | --- |
| หน้ารายการมี `page.tsx` / `loading.tsx` / `types.ts`, ใช้ `parseListParams`, ประกาศ `*_SORTABLE` | ทุกโฟลเดอร์ใน `(dashboard)` ที่เรียก `paginate` |
| view ที่เรียก action ใช้ `useOptimisticList` | module ที่มี `actions.ts` |
| `"use server"` + ทุก export สร้างด้วย `createAction()` | ทุก `actions.ts` |
| ทุก action เช็คสิทธิ์ด้วย `requireUser()` / `requireRole()` | action ใน `(dashboard)` |
| ทุก action ที่เขียนข้อมูลอยู่ใน `$transaction()` พร้อม `logAudit(tx, …)` | ทุก `actions.ts` |
| ไม่ import `sonner` ตรง ๆ, ไม่ใช้สีตายตัว (`bg-red-500`), ไม่เขียนข้อความไทย/ลาว/จีนลง UI | ทั้ง `src/` |
| ไฟล์ข้อความของ module ลงทะเบียนครบ, คีย์ไม่ชนกัน, ทุกภาษามีคีย์ครบ | `src/i18n/modules/` |

ข้อยกเว้นที่ตั้งใจ: ใส่ป้าย `@audit-exempt` ในคอมเมนต์ของไฟล์ action **พร้อมเหตุผล**
(ตัวอย่าง: heartbeat ใน `src/app/(dashboard)/actions.ts`) — ห้ามแก้เทสต์ใน `tests/conventions/` เพื่อให้ผ่าน

---

## 6. สำหรับผู้ดูแล repo template

- แก้ module products แล้ว → `bun run scaffold:sync` (เทสต์ฟ้องถ้าลืม)
- ทุก release: เพิ่ม `version` ใน `template.json`, เขียน `CHANGELOG.md` (มีหัวข้อ "ต้องทำใน project" ถ้ามี), ติด tag `vX.Y.Z`
- ย้ายไฟล์ core หรือเปลี่ยนสัญญาของจุดต่อขยาย = breaking change → เพิ่มเลข major และเขียนวิธีย้ายใน CHANGELOG
- เพิ่มกฎใหม่ใน `AGENTS.md` → เพิ่มเทสต์ใน `tests/conventions/` ด้วยถ้าตรวจอัตโนมัติได้
