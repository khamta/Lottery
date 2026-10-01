# Architecture

> กติกาการเขียนโค้ดแบบละเอียด (สำหรับคนและ AI) อยู่ที่ [`AGENTS.md`](../AGENTS.md)

## การไหลของข้อมูล — หน้ารายการ

```
URL ?page=2&pageSize=20&q=เก้าอี้&sort=price&order=asc
  ↓
Server Component (page.tsx)
  ├─ parseListParams(searchParams, { sortable, defaultSort })   → ค่าที่เชื่อถือได้เสมอ
  └─ paginate(prisma.model, { params, where, orderBy, select, map })
        ├─ findMany({ skip: (page-1)*pageSize, take: pageSize })   ← ดึงเฉพาะหน้าที่ขอ
        └─ count({ where })                                        ← ไว้คำนวณ pageCount
  ↓ Paginated<TRow> = { rows, total, page, pageSize, pageCount }
Client Component (<Module>View)
  ├─ useOptimisticList(page.rows)    → rows ที่เห็นบนจอ (รวมรายการที่ยังรอผล)
  └─ <DataTable page={{...page, rows}} pending={isPending} />
        ├─ <SearchInput />            เขียน ?q= (debounce 350ms)
        ├─ header คลิกเรียง           เขียน ?sort= &order=
        └─ <DataTablePagination />    เขียน ?page= &pageSize=
  ↓ URL เปลี่ยน → Next render server component ใหม่ → วนกลับข้อบน
```

**ทำไมต้องแบ่งหน้าที่ฐานข้อมูล:** ฝั่ง client ได้ข้อมูลแค่ `pageSize` แถวเสมอ
ตารางที่มี 10 แถวกับ 10 ล้านแถวใช้เวลาโหลดเท่ากัน และ payload ที่ส่งข้ามเครือข่ายไม่โต

**ทำไมสถานะต้องอยู่ใน URL:** แชร์ลิงก์แล้วเห็นหน้าเดียวกัน, ปุ่ม back/forward ทำงานถูก,
refresh แล้วไม่หลุดกลับหน้า 1, และ server component อ่านค่าไปสั่ง Prisma ได้โดยไม่ต้อง sync state

## การไหลของข้อมูล — การเขียน (optimistic)

```
ผู้ใช้กดบันทึก/ลบ
  ↓
mutate({ patch, action })                     ← useOptimisticList
  ├─ 1. applyOptimistic(patch)   หน้าจอเปลี่ยนทันที (แถวติดธง __optimistic, หรี่แสง)
  ├─ 2. await action()           server action ทำงานจริง
  ├─ 3a. สำเร็จ  → toast + router.refresh()  ดึงข้อมูลจริงมาทับ
  └─ 3b. ล้มเหลว → toast error + React ย้อน state กลับให้เองเมื่อ transition จบ
```

ทั้งหมดอยู่ใน `startTransition` เดียวกัน — ถ้าเรียก action นอก transition
ค่า optimistic จะเด้งกลับตั้งแต่ก่อน action เสร็จ (เป็นข้อจำกัดของ `useOptimistic`)

## สัญญากลาง (contract)

### 1. `ActionResult` — `src/lib/action.ts`

```ts
type ActionResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]>; code?: ... }
```

สร้าง action ด้วย `createAction(schema, handler, { successMessage })`
— validate อัตโนมัติ, แปลง Prisma error (เช่น P2002 ข้อมูลซ้ำ) เป็นข้อความภาษาไทย

### 2. `Paginated<T>` — `src/types/index.ts`

รูปแบบเดียวที่ทุกหน้ารายการส่งจาก server ไป client:
`{ rows, total, page, pageSize, pageCount }`

### 3. `handleResult` — `src/lib/notify.ts`

```ts
if (!handleResult(result)) return;   // แสดง toast error ให้แล้ว
```

### 4. สิทธิ์การใช้งาน

- `middleware.ts` กันระดับ route (ยังไม่ login = เด้งไป `/login`)
- `requireUser()` / `requireRole(["ADMIN"])` กันในทุก server action
- `config/nav.ts` ซ่อนเมนูตาม role (เป็นแค่ UX — การกันจริงอยู่ที่ 2 ข้อบน)

### 5. สถานะ loading (5 ระดับ)

| ระดับ | ใช้อะไร |
| --- | --- |
| เปิดแอปครั้งแรก / กด refresh | `#app-splash` — โลโก้ + แถบวิ่ง ส่งมาพร้อม HTML จาก server จึงเห็นทันที แล้วจางออกเมื่อ React hydrate เสร็จ |
| เปลี่ยนหน้า (navigation) | `<RouteProgress />` แถบโหลดบางด้านบนจอ + `loading.tsx` ของแต่ละ route (skeleton ที่หน้าตาเหมือนของจริง) |
| เปลี่ยนหน้า/เรียง/ค้นหาในตาราง | `pending` ของ DataTable (ตารางหรี่แสง ข้อมูลเดิมยังอยู่) |
| กำลังบันทึก (create / update / delete) | `<MutationOverlay />` ม่านโหลดเต็มจอ (เบลอพื้นหลัง + การ์ดกลางจอ + ข้อความ `common.saving` / `common.deleting`) — `useOptimisticList().mutate()` เปิด/ปิดให้เอง ไม่ต้องต่อสายใน module และ **ไม่มี spinner ในปุ่ม** (ข้อมูล optimistic ยังขึ้นทันทีเหมือนเดิม) |
| ปุ่ม/ฟอร์มที่ต้องรอจริงแต่ไม่ใช่ CRUD (เช่น login) | `<Button loading={form.formState.isSubmitting}>` |

ม่านโหลด (`src/components/shared/mutation-overlay.tsx`):
- นับงานค้างแบบ counter — บันทึกหลายรายการพร้อมกันก็ปิดเมื่องานสุดท้ายจบ
- รอ 150ms ก่อนโผล่ (งานเร็วจะไม่กระพริบ) และเมื่อโผล่แล้วค้างอย่างน้อย 450ms
- บล็อกการคลิก/คีย์บอร์ดระหว่างแสดง, มี `role="status"` + `aria-live`, เคารพ `prefers-reduced-motion`
- งานเขียนข้อมูลที่ไม่ผ่าน `mutate()` ให้เรียก `const end = beginMutation("common.processing")` แล้ว `end()` ใน `finally`
  (`<ConfirmDialog />` ทำให้เองเมื่อ `onConfirm` เป็น async)

### 6. การแจ้งเตือน

ใช้ `notify.success / error / warning / info` เท่านั้น ห้ามเรียก `toast` จาก sonner ตรง ๆ
เพื่อให้เปลี่ยนสไตล์ทั้งระบบได้จากไฟล์เดียว

## เปลี่ยนฐานข้อมูล

แก้ `datasource db { provider = ... }` ใน `prisma/schema.prisma`

- SQL Server: `provider = "sqlserver"` และ `DATABASE_URL="sqlserver://host:1433;database=app;user=sa;password=...;trustServerCertificate=true"`
- MySQL: `provider = "mysql"`
- SQLite (dev): `provider = "sqlite"` + `DATABASE_URL="file:./dev.db"` (ต้องเอา `@db.Decimal`/`@db.Text` ออก)

> `mode: "insensitive"` ใน `where` ของหน้ารายการใช้ได้เฉพาะ PostgreSQL
> ถ้าย้าย provider ให้ตัดออก (SQL Server/MySQL ส่วนใหญ่ collation ไม่สนตัวพิมพ์อยู่แล้ว)
