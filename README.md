# Next.js Starter Template

Template กลางสำหรับใช้ซ้ำได้ทุก project — โครงสร้างเดียวกันทั้งหมด เปลี่ยนแค่ **design token** กับ **domain model**

| ส่วนประกอบ | เทคโนโลยี |
| --- | --- |
| Runtime / PM | Bun 1.1+ |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui (new-york) + lucide-react |
| Database | Prisma ORM + PostgreSQL (เปลี่ยน provider ได้) |
| Auth | Auth.js v5 (credentials + role guard) |
| Form / Validation | react-hook-form + zod (ใช้ schema ตัวเดียวกันทั้ง client & server) |
| Alert | sonner toast ผ่าน `notify` / `handleResult` |
| Loading | route `loading.tsx` + skeleton + optimistic UI |
| รายการข้อมูล | แบ่งหน้าที่ฐานข้อมูล (skip/take) + ค้นหา/เรียงผ่าน URL |
| Test | bun test + Testing Library (happy-dom) |
| หลายภาษา | ไทย / ລາວ / English / 中文 (cookie-based ไม่ต้องแตก route) |
| มือถือ | เมนูปุ่มล่างจอแบบแอป, ซ่อนแถบเลื่อน, รองรับ safe-area |

---

## เริ่มใช้งานใน 5 ขั้นตอน

> ใช้ [Bun](https://bun.sh) เป็น package manager และ runtime (ต้องการ Bun 1.1 ขึ้นไป)
> Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`

```bash
# 1. ติดตั้ง dependency
bun install

# 2. ตั้งค่า environment
cp .env.example .env      # Windows: copy .env.example .env
#   แก้ DATABASE_URL และสร้าง AUTH_SECRET ด้วย:  bunx auth secret

# 3. สร้างตารางในฐานข้อมูล
bun run db:push           # หรือ bun run db:migrate สำหรับ migration แบบมีประวัติ

# 4. ใส่ข้อมูลตัวอย่าง (admin@example.com / Admin@123)
bun run db:seed

# 5. รัน
bun run dev
```

เปิด http://localhost:3000 → ระบบจะพาไปหน้า `/login`

---

## โครงสร้างโฟลเดอร์

```
prisma/
  schema.prisma          # โครงฐานข้อมูล (User/Account/Session + ตัวอย่าง Product)
  seed.ts                # ข้อมูลเริ่มต้น
src/
  app/
    (auth)/              # login / register + server action
    (dashboard)/         # ทุกหน้าหลัง login (layout เดียวกัน: sidebar + header)
      dashboard/         # หน้าแรก + การ์ดสรุป
      products/          # ★ ตัวอย่าง CRUD ครบวงจร — ต้นแบบของ bun run new:module
      users/             # ตัวอย่างหน้าที่จำกัดเฉพาะ ADMIN
      settings/
    api/auth/[...nextauth]/
    globals.css          # ★ DESIGN TOKEN ของ template (project override ที่ styles/brand.css)
  components/
    ui/                  # shadcn components (แก้ได้ตามต้องการ)
    layout/              # sidebar (ย่อได้), header, BottomNav (มือถือ), เมนูผู้ใช้
    shared/              # DataTable, DataTablePagination, SearchInput, PageHeader,
                         #   EmptyState, Loading, ConfirmDialog
  config/
    site.ts              # ชื่อแอป, ธีมเริ่มต้น, ขนาดหน้า
    nav.ts               # ★ เมนู sidebar ทั้งหมด (รองรับซ่อนตาม role)
    brand.tsx            # โลโก้ (BrandIcon)
    audit.ts             # ชื่อ entity ในหน้าประวัติการใช้งาน
  hooks/
    use-optimistic-list.ts  # ★ มาตรฐาน optimistic CRUD (แสดงผลก่อน ยืนยันทีหลัง)
  i18n/
    config.ts            # รายชื่อภาษา + cookie
    dictionaries/        # ข้อความกลางของ template 4 ภาษา (th เป็นต้นฉบับ)
    modules/             # ★ ข้อความของแต่ละ module — ไฟล์ละ module ครบ 4 ภาษา
    client.tsx server.ts # useI18n() / getTranslations()
  lib/
    auth.ts / auth.config.ts   # Auth.js
    prisma.ts            # Prisma client (singleton)
    query.ts             # ★ parseListParams / paginate / buildOrderBy — แบ่งหน้าที่ DB
    action.ts            # ★ createAction: validate + จัดการ error รูปแบบเดียวกันทุกที่
    notify.ts            # ★ toast + handleResult
    validations/         # zod schema แยกตาม domain
    env.ts               # ตรวจ .env ตั้งแต่ boot
  styles/
    brand.css            # ★ สีของ project (override token)
    themes/              # ชุดสีสำเร็จรูป (ocean / emerald / violet)
  middleware.ts          # ป้องกัน route ก่อนถึง server
scaffold/module/         # แม่แบบของ bun run new:module (สำเนาของ products)
scripts/                 # new-module / sync-scaffold / template-check
tests/conventions/       # ★ ตรวจกฎใน AGENTS.md อัตโนมัติทุก module
template.json            # ★ ไฟล์ไหนของ template (core) / ของ project
AGENTS.md                # ★ กติกาสำหรับ AI/คนที่มาต่อยอด — อ่านก่อนเขียนโค้ดใหม่
CLAUDE.md                # ชี้ไปที่ AGENTS.md
tests/                   # bun test — unit / components / server actions
bunfig.toml              # config ของ bun test
.github/workflows/ci.yml # typecheck + test + build
```

---

## ทำ module ใหม่ (เช่น Orders)

```bash
bun run new:module orders
```

ได้ page / loading / types / actions / view / columns / dialog + zod schema + ข้อความ 4 ภาษา + เทสต์ ตามแบบ products
แล้วทำตามขั้นตอนที่คำสั่งพิมพ์ออกมา: model ใน `prisma/schema.prisma` → ฟิลด์ → ถ้อยคำ → เมนูใน `src/config/nav.ts`

ไม่ต้องแตะ layout / auth / ตาราง / toast — ใช้ของกลางที่มีอยู่แล้ว

---

## ใช้กับหลายระบบ — รูปแบบเดียวกัน ต่อยอดได้เอง

- ไฟล์แบ่งเป็น **core** (ของ template ห้ามแก้ใน project) กับ **project** (ของแต่ละระบบ) — รายการใน `template.json`
- แต่ละระบบต่อยอดผ่านจุดต่อขยาย: `src/config/*` (ชื่อ, เมนู, โลโก้, audit) · `src/styles/brand.css` (สี)
  · `src/i18n/modules/*` (ข้อความ) · module ของตัวเองใน `src/app/(dashboard)/`
- ระบบยังผูกกับ template เป็น git remote → `git merge template/main` รับแก้บั๊ก/ฟีเจอร์กลางได้ตลอด
- `tests/conventions/` ตรวจทุก module ว่ายังตรงตามกฎ — ระบบไหนหลุดรูปแบบ `bun test` จะไม่ผ่าน

รายละเอียด: [`docs/EXTENDING.md`](docs/EXTENDING.md)

---

## กติกาที่ทำให้ทุก project และทุก module เหมือนกัน

- **ทุกหน้ารายการ** ดึงข้อมูลที่ server component แล้วแบ่งหน้าที่ฐานข้อมูลด้วย `paginate()`
  — ห้าม `findMany()` ทั้งตารางมากรองฝั่ง client
- **สถานะตาราง** (page / pageSize / q / sort / order) อยู่ใน URL ไม่ใช่ `useState`
  ค่าเริ่มต้น 10 รายการต่อหน้า เลือกได้ 10/20/50/100 ที่ `config/site.ts`
- **ทุกการบันทึก/แก้ไข/ลบ** ใช้ `useOptimisticList().mutate()` — หน้าจอเปลี่ยนทันที
  ถ้า server ตอบไม่สำเร็จจะย้อนกลับเองพร้อม toast error
- **ห้าม hardcode สี** — ใช้ class ที่ผูกกับ token เท่านั้น (`bg-primary`, `text-muted-foreground`, `border`)
- **ทุก server action** คืนค่า `ActionResult` ผ่าน `createAction` และฝั่ง client เรียก `handleResult`
- **ทุกฟอร์ม** ใช้ zod schema ตัวเดียวกับที่ server ใช้ validate ซ้ำ
- **ทุกหน้าใน dashboard** เริ่มด้วย `<PageHeader />` และมี `loading.tsx` ของตัวเอง
- **ทุกตาราง** ใช้ `<DataTable />` กลาง — แถบบนเรียง จำนวนต่อหน้า → ค้นหา → ปุ่มของ module
- **ทุกข้อความ** เป็นคีย์ i18n แปลครบ 4 ภาษา ห้าม hardcode ลง component

รายละเอียดทั้งหมดพร้อมโค้ดแม่แบบอยู่ใน [`AGENTS.md`](AGENTS.md) — ให้ AI อ่านไฟล์นี้ก่อนต่อยอดเสมอ

เอกสารเพิ่มเติม: [`AGENTS.md`](AGENTS.md) · [`docs/I18N.md`](docs/I18N.md) · [`docs/THEMING.md`](docs/THEMING.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/TESTING.md`](docs/TESTING.md) · [`docs/NEW-PROJECT.md`](docs/NEW-PROJECT.md) · [`docs/EXTENDING.md`](docs/EXTENDING.md) · [`CHANGELOG.md`](CHANGELOG.md)

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `bun run dev` | รัน dev server |
| `bun run build` | prisma generate + build production |
| `bun run typecheck` | ตรวจ TypeScript ทั้งโปรเจกต์ |
| `bun test` | รันเทสต์ทั้งหมด |
| `bun run test:watch` | รันเทสต์แบบ watch |
| `bun run test:coverage` | รันเทสต์พร้อม coverage |
| `bun run db:push` | sync schema เข้า DB (dev) |
| `bun run db:migrate` | สร้าง migration |
| `bun run db:studio` | เปิด Prisma Studio |
| `bun run db:seed` | ใส่ข้อมูลตัวอย่าง |
| `bun add <pkg>` | เพิ่ม dependency |
| `bunx shadcn@latest add <component>` | เพิ่ม component ของ shadcn |
