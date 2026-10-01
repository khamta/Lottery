# AGENTS.md — กติกาสำหรับ AI และคนที่มาต่อยอดโปรเจกต์นี้

ไฟล์นี้คือ "สัญญา" ของ template ทุก module ต้องทำตามรูปแบบเดียวกันนี้เสมอ
ไม่ว่าจะเป็นระบบสินค้า ระบบผู้ใช้ ระบบใบสั่งซื้อ หรืออะไรก็ตาม
**ก่อนเขียนโค้ดใหม่ ให้อ่านไฟล์นี้จบก่อน แล้วลอกรูปแบบจาก module `products` เป็นต้นแบบ**

**ไฟล์ core ห้ามแก้ใน project** (รายการใน `template.json`) — ต่อยอดผ่านจุดต่อขยายเท่านั้น
(`src/config/*`, `src/styles/brand.css`, `src/i18n/modules/*`, module ของตัวเอง) ดู `docs/EXTENDING.md`
module ใหม่สร้างด้วย `bun run new:module <ชื่อ>` เสมอ และกฎในไฟล์นี้ถูกตรวจอัตโนมัติด้วย `tests/conventions/`

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Prisma · Auth.js v5 · Tailwind v4 + shadcn/ui · Bun · bun test
ภาษา: ไทย / ລາວ / English / 中文 (ดู `docs/I18N.md`)

---

## 0. กฎเหล็ก 10 ข้อ

1. ดึงข้อมูลที่ **server component** เท่านั้น — client component ห้าม fetch เอง
2. แบ่งหน้าที่ **ฐานข้อมูล** เสมอ (`paginate()`) ห้ามดึงทั้งตารางมากรองฝั่ง client
3. สถานะตาราง (page / pageSize / q / sort / order) อยู่ใน **URL** ไม่ใช่ useState
4. `pageSize` เริ่มต้น 10 และต้องเป็นค่าใน `siteConfig.pagination.pageSizeOptions`
5. ทุกการเขียนข้อมูลผ่าน **server action** ที่สร้างด้วย `createAction(schema, handler)`
6. ทุกการเขียนข้อมูลจากตาราง ใช้ **`useOptimisticList().mutate()`** — หน้าจอขยับก่อน ฐานข้อมูลตามทีหลัง
7. zod schema ตัวเดียว ใช้ทั้งฟอร์ม (client) และ action (server) — อยู่ใน `src/lib/validations/`
8. แจ้งผลด้วย `handleResult()` / `notify` เท่านั้น ห้ามเรียก `toast` จาก sonner ตรง ๆ
9. ห้าม hardcode สี — ใช้ utility ที่ผูกกับ token (`bg-primary`, `text-muted-foreground`, `border`)
   และห้ามครอบเนื้อหาด้วย `max-w-*` เอง — layout ของ dashboard ให้เนื้อหาเต็มความกว้างอยู่แล้ว
10. ทุก module ใหม่ต้องมีเทสต์ 3 ระดับ (schema / server action / component) ตาม `docs/TESTING.md`
11. **ห้ามเขียนข้อความลง UI ตรง ๆ** — ทุกข้อความเป็นคีย์ i18n และต้องแปลครบ 4 ภาษา
    (ข้อความของ module อยู่ใน `src/i18n/modules/<module>.ts` — ไม่ใช่ `dictionaries/` ซึ่งเป็นของ template)
12. **ทุกหน้าต้องใช้ได้จริงบนมือถือ** ตามข้อ 5 ด้านล่าง (เมนูล่างจอ, ไม่มีแถบเลื่อน, ปุ่มเต็มความกว้าง)

---

## 1. โครงของ "หน้ารายการ" (list page) — มาตรฐานเดียวทั้งระบบ

```
URL (?page=2&pageSize=20&q=...&sort=name&order=asc)
  ↓ อ่านที่ server component
parseListParams(searchParams, { sortable, defaultSort })   ← src/lib/query.ts
  ↓
paginate(prisma.<model>, { params, where, orderBy, select, map })
  ↓ ได้ Paginated<TRow> = { rows, total, page, pageSize, pageCount }
<XxxView page={page} />            ← client component
  ↓
<DataTable columns={columns} page={page} pending={isPending} />
  ↓ ผู้ใช้กดเปลี่ยนหน้า/เรียง/ค้นหา → เขียนค่าลง URL → Next render server component ใหม่
```

ทุกไฟล์ที่เกี่ยวข้องอยู่ที่เดียวกันเสมอ:

```
src/app/(dashboard)/<module>/
  page.tsx                 # server: parseListParams → paginate → ส่งให้ view
  loading.tsx              # skeleton หน้าตาเหมือนของจริง
  types.ts                 # <X>Row (ชนิดที่ส่งข้าม server→client ได้) + <X>_SORTABLE
  actions.ts               # server actions ทั้งหมดของ module
  _components/
    <module>-view.tsx      # client: optimistic + dialog + ตาราง
    columns.tsx            # นิยามคอลัมน์ (client)
    <module>-dialog.tsx    # ฟอร์ม (ไม่เรียก action เอง — ส่งค่าออกทาง onSubmit)
```

### 1.1 แม่แบบ `page.tsx`

```tsx
export default async function OrdersPage({ searchParams }: PageProps) {
  const params = parseListParams(await searchParams, {
    sortable: ORDER_SORTABLE,     // whitelist กัน orderBy แปลกปลอม
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  const where = params.q
    ? { OR: [{ code: { contains: params.q, mode: "insensitive" as const } }] }
    : undefined;

  const page = await paginate<OrderRow, RawOrder>(prisma.order, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { createdAt: "desc" },
    select: { id: true, code: true, total: true, createdAt: true },
    map: (row) => ({ ...row, total: Number(row.total), createdAt: row.createdAt.toISOString() }),
  });

  return <OrdersView page={page} />;
}
```

กฎย่อย:
- `select` เสมอ (อย่าใช้ `include` ทั้งก้อนถ้าไม่จำเป็น) — ส่งเฉพาะ field ที่ตารางใช้
- `map` มีไว้แปลงค่าที่ข้าม server→client ไม่ได้: `Decimal → Number`, `Date → toISOString()`
- ค้นหาหลายคอลัมน์ใช้ `OR`; `mode: "insensitive"` ใช้ได้เฉพาะ PostgreSQL

### 1.2 แถบเครื่องมือของตาราง (ลำดับตายตัว)

`<DataTable />` วางแถบบนให้เองในลำดับ: **จำนวนต่อหน้า → ช่องค้นหา → ปุ่มของ module**
ส่วนแถบล่างมีแค่ช่วงรายการที่แสดง + ปุ่มเปลี่ยนหน้า ห้ามย้ายหรือทำตัวเลือกจำนวนต่อหน้าเองซ้ำ

### 1.3 คอลัมน์ที่เรียงได้

`id` ของคอลัมน์ต้องตรงกับชื่อ field ใน Prisma และต้องอยู่ใน `<X>_SORTABLE`

```tsx
{ id: "price", accessorKey: "price", header: "ราคา", enableSorting: true, cell: ... }
```

---

## 2. การเขียนข้อมูล (create / update / delete)

### 2.1 Server action — `actions.ts`

```ts
"use server";

export const createOrder = createAction(
  createOrderSchema,                 // zod: validate ซ้ำฝั่ง server เสมอ
  async (input) => {
    const user = await requireUser(); // หรือ requireRole(["ADMIN"])
    const order = await prisma.order.create({ data: { ...input, createdById: user.id } });
    revalidatePath("/orders");        // ให้ router.refresh() ได้ข้อมูลใหม่จริง
    return { id: order.id };
  },
  { successMessage: "บันทึกคำสั่งซื้อแล้ว" },
);
```

`createAction` จัดการให้อัตโนมัติ: validate, แปลง error เป็น `ActionResult` ภาษาไทย,
map `P2002` (ข้อมูลซ้ำ) → `CONFLICT`, `UNAUTHORIZED` / `FORBIDDEN` → ข้อความที่ผู้ใช้อ่านรู้เรื่อง

### 2.2 Optimistic update — บังคับใช้ทุก module

ผู้ใช้กดบันทึก → รายการขึ้น/เปลี่ยน/หายทันที → ค่อยยืนยันกับฐานข้อมูลเบื้องหลัง
ถ้าไม่สำเร็จ React จะย้อนสถานะกลับให้เอง แล้วขึ้น toast error

```tsx
const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

// เพิ่ม
mutate({
  patch: { type: "create", item: { id: tempId(), ...values } },
  action: () => createOrder(values),
});

// แก้ไข
mutate({
  patch: { type: "update", item: { ...editing, ...values } },
  action: () => updateOrder({ ...values, id: editing.id }),
});

// ลบ
mutate({
  patch: { type: "delete", id: row.id },
  action: () => deleteOrder({ id: row.id }),
});

// ลบหลายรายการ (จาก checkbox) — action ใช้ prisma.xxx.deleteMany({ where: { id: { in: ids } } })
mutate({
  patch: { type: "delete-many", ids },
  action: () => deleteOrders({ ids }),
});

// แล้วปิด dialog ทันที ไม่ต้อง await
setFormOpen(false);
```

ส่ง `rows` (ที่ได้จาก hook) กลับเข้า DataTable และส่ง `pending={isPending}`:

```tsx
<DataTable columns={columns} page={{ ...page, rows }} pending={isPending} />
```

**เลือกหลายรายการ (checkbox)** — ใส่ `selectable` แล้ว DataTable เติมคอลัมน์ checkbox + "เลือกทั้งหมด" ให้เอง
เมื่อเลือกแล้วจะมีแถบ "เลือกแล้ว N รายการ" โผล่เหนือตาราง พร้อมปุ่มจาก `bulkActions`
(ยืนยันด้วย `<ConfirmDialog />` เสมอ แล้วเรียก `clear()` หลังยิง `mutate()` — ดู `products-view.tsx`):

```tsx
<DataTable
  selectable
  bulkActions={({ rows, clear }) => (
    <Button variant="destructive" size="sm" onClick={() => setBulkDeleting({ rows, clear })}>
      <Trash2 /> {t("common.deleteSelected")}
    </Button>
  )}
  ...
/>
```

เมนูจัดการของแต่ละแถวใช้ไอคอนจุดแนวตั้ง `<EllipsisVertical />` (ดู `columns.tsx`)

**ข้อควรรู้**
- ระหว่างบันทึก `mutate()` จะเปิด **ม่านโหลดเต็มจอ** (`<MutationOverlay />` ติดตั้งไว้ใน `Providers` แล้ว)
  ให้อัตโนมัติ และปิดเมื่อ transition จบ — ไม่ต้องต่อสายเอง และ **ห้ามใส่ spinner / `loading` ในปุ่ม CRUD**
  (ถ้าต้องกันกดซ้ำให้ใช้ `disabled` เท่านั้น)
- แถวที่ยังรอผลจะถูกติดธง `__optimistic` และตารางจะหรี่แสง + กดไม่ได้ชั่วคราว
- ห้ามเรียก server action นอก `mutate()` — ถ้าอยู่นอก transition ค่าจะเด้งกลับก่อน action เสร็จ
- ฟอร์ม (dialog) ต้องไม่เรียก action เอง ให้รับ `onSubmit(values)` แล้วส่งค่าออกมาให้ view
- error รายฟิลด์จาก server จะมาในรูป toast (ไม่ map กลับเข้าฟอร์มแล้ว เพราะ dialog ปิดไปก่อน)
  — จึงต้องให้ zod ฝั่ง client ครอบคลุมกฎเดียวกับ server

---

## 2.3 Audit log (บังคับทุกการเขียนข้อมูล)

ทุก server action ที่ **สร้าง / แก้ไข / ลบ** ข้อมูลต้องบันทึกประวัติด้วย `logAudit()`
(หรือ `logAuditMany()` เมื่อลบ/แก้หลายรายการพร้อมกัน — ดู `deleteProducts`)
**ภายใน `prisma.$transaction()` เดียวกัน** กับการเขียนข้อมูลจริง เพื่อให้ audit log กับข้อมูลจริง
atomic กันเสมอ (ถ้า transaction ล้มเหลว จะไม่มีการเขียนข้อมูลครึ่ง ๆ กลาง ๆ โดยไม่มี audit log กำกับ)

```ts
const product = await prisma.$transaction(async (tx) => {
  const product = await tx.product.create({ data: { ...input, createdById: user.id } });

  await logAudit(tx, {
    action: "CREATE",
    entity: "Product",
    entityId: product.id,
    summary: `${product.sku} · ${product.name}`, // ป้ายชื่อที่อ่านรู้เรื่อง แม้ record ถูกลบไปแล้ว
    after: product,
    user, // จาก requireUser()
  });

  return product;
});
```

กฎย่อย:
- `before` / `after` ส่ง object ของฟิลด์ก่อน/หลังเปลี่ยนแปลง — `logAudit` จะ diff ให้เองด้วย `diffChanges`
  (`src/lib/audit.ts`) และข้าม `UPDATE` ที่ไม่มีอะไรเปลี่ยนจริงให้อัตโนมัติ
- ฟิลด์อ่อนไหว (`password`, `avatar`, ฟิลด์ที่ชื่อมีคำว่า `token`) ถูก redact ให้เองเสมอ —
  **ห้าม** ส่ง bytes หรือ token จริงเข้าไปใน `before`/`after` โดยตรง ถ้าต้องการแค่บอกว่า "เปลี่ยนแล้ว"
  ให้ส่งเป็นค่าเบา ๆ เช่น `{ avatar: true/false }` แทน (ดู `profile/actions.ts`)
- `UPDATE` ต้องมี `before` มาจาก `findUnique` ก่อน `update` เสมอ (อยู่ใน transaction เดียวกัน กันข้อมูลเพี้ยนจาก request คู่ขนาน)
- `DELETE` ใช้ผลลัพธ์จาก `tx.xxx.delete(...)` เป็น `before` ได้เลย (Prisma คืน record ที่ถูกลบมาให้)

---

## 2.4 ข้อความหลายภาษา (บังคับ)

```tsx
// ❌ <h1>สินค้า</h1>
// ✅
const { t, intl } = useI18n();          // client component
const { t, intl } = await getTranslations();  // server component
<h1>{t("products.title")}</h1>
<span>{formatDate(row.updatedAt, intl)}</span>
```

- ข้อความของ module: `src/i18n/modules/<module>.ts` ด้วย `defineModuleMessages({ th, lo, en, zh })`
  ครบ 4 ภาษาในไฟล์เดียว แล้วลงทะเบียนใน `src/i18n/modules/index.ts` (`new:module` ทำให้เอง)
  — ภาษาไทยเป็นต้นฉบับ ภาษาอื่นขาด/เกินคีย์ TypeScript จะ error และ `tests/conventions/` เช็คซ้ำ
- คีย์ของ module อยู่ใต้ namespace ตัวเอง (`orders.*`, zod ใช้ `orders.validation.*`)
  เติมเข้า namespace กลางได้แค่ `nav.<module>` และ `auditLogs.entity<Model>`
- `src/i18n/dictionaries/*.ts` เป็นข้อความกลางของ template — **ห้ามเพิ่มคีย์ของ module ที่นั่น**
  (อยากเปลี่ยนถ้อยคำของ template ให้เขียนคีย์เดิมทับในไฟล์ของ module — ระบบ deep-merge ให้)
- zod message และ `successMessage` ของ action เก็บ **คีย์** ไม่ใช่ข้อความ
- เมนูใน `config/nav.ts` ใช้ `titleKey` / `labelKey`
- วันที่/ตัวเลข/สกุลเงินต้องส่ง `intl` เข้าไปเสมอ (`formatDate(value, intl)`)
- **ฟอนต์ไม่ผูกกับภาษาที่เลือก** — มีชุดเดียว (`appFontStack`) ที่เบราว์เซอร์เลือกให้รายตัวอักษร
  ห้ามตั้ง `font-family` เองใน component และห้ามสลับฟอนต์ตาม locale

รายละเอียดเต็มอยู่ใน `docs/I18N.md`

---

## 3. ขั้นตอนสร้าง module ใหม่ (ทำตามลำดับนี้)

0. `bun run new:module <ชื่อพหูพจน์ kebab-case>` (เช่น `orders`, `purchase-orders`, `people --singular person`)
   → ได้ไฟล์ทุกตัวในข้อ 2–6, 8, 9 ตามแบบ products + ลงทะเบียนข้อความและ audit entity ให้แล้ว
   **ห้าม copy โฟลเดอร์เอง** แล้วไล่แก้ไฟล์ที่ได้ตามข้อด้านล่าง
1. `prisma/schema.prisma` → เพิ่ม model (ใต้ model ของ template) → `bun run db:push`
2. `src/lib/validations/<module>.ts` → zod schema (create / update / delete)
3. `src/app/(dashboard)/<module>/types.ts` → `<X>Row` + `<X>_SORTABLE`
4. `actions.ts` → server actions ด้วย `createAction` + ห่อการเขียนข้อมูลด้วย `prisma.$transaction()`
   แล้วเรียก `logAudit()`/`logAuditMany()` ในนั้นเสมอ (ดูข้อ 2.3)
5. `page.tsx` + `loading.tsx` → ตามแม่แบบข้อ 1.1
6. `_components/` → `columns.tsx`, `<module>-view.tsx`, `<module>-dialog.tsx`
7. `src/config/nav.ts` → เพิ่มเมนูด้วย `titleKey` (ใส่ `roles` ถ้าจำกัดสิทธิ์)
8. `src/i18n/modules/<module>.ts` → แก้ถ้อยคำของ module ครบทั้ง 4 ภาษา
9. `tests/server/<module>-actions.test.ts` → ปรับตามฟิลด์จริง + เพิ่มเคส schema + assert ว่ามีการเขียน audit log ถูก action/ถูกคน
10. `bun run typecheck && bun test` (`tests/conventions/` จะฟ้องถ้า module ผิดรูปแบบ)

---

## 3.5 มาตรฐานมือถือ (ทำเหมือนกันทุก project)

จอเล็ก (< `lg`) ต้องให้ความรู้สึกเหมือนแอป ไม่ใช่เว็บย่อส่วน — ของกลางทำให้แล้ว อย่าสร้างใหม่เอง

| เรื่อง | มาตรฐาน | อยู่ที่ไหน |
| --- | --- | --- |
| เมนูหลัก | แถบปุ่มล่างจอ (ไอคอน + ป้ายชื่อ) เกิน 4 เมนูยุบเป็นปุ่ม "เพิ่มเติม" ที่เปิด sheet จากด้านล่าง | `<BottomNav />` (dashboard layout ใส่ให้แล้ว) |
| sidebar | ซ่อนบนมือถือทั้งหมด (`lg:flex`) | `<AppSidebar />` |
| แถบบน | โลโก้ + ชื่อแอปทางซ้าย, ภาษา/ธีม/ผู้ใช้ทางขวา | `<AppHeader />` |
| แถบเลื่อน | ซ่อนทั้งหมดบนจอสัมผัส/จอเล็ก (ยังเลื่อนได้) | `globals.css` |
| แบ่งหน้า | จัดกึ่งกลางบนมือถือ, ซ้าย-ขวาบนจอใหญ่ | `<DataTablePagination />` |
| แถบเครื่องมือของตาราง | "ต่อหน้า" + ช่องค้นหาอยู่แถวเดียวกันและกว้างเต็มจอ ปุ่มของ module อยู่บรรทัดถัดมาแบบเต็มความกว้าง | `<DataTable toolbar={...} />` |
| พื้นที่ด้านล่าง | `pb-[calc(5.5rem+env(safe-area-inset-bottom))]` เผื่อแถบเมนู + ปุ่มโฮม iPhone | dashboard layout |
| การแตะ | ไม่มีไฮไลต์ฟ้า, ไม่เด้งเกินขอบ (`overscroll-behavior-y: none`) | `globals.css` |

กฎ: เมนูมาจาก `src/config/nav.ts` ชุดเดียว — เพิ่มเมนูที่นั่นที่เดียว ทั้ง sidebar และแถบล่างจะได้ตรงกันเสมอ
หน้าไหนมีปุ่มลอย (FAB) หรือแถบเครื่องมือของตัวเอง ต้องเว้นระยะไม่ให้ทับแถบเมนูล่าง

---

## 4. ไฟล์กลางที่ห้ามทำซ้ำ (ถ้าต้องแก้ ให้แก้ที่ต้นทาง)

| ต้องการ | ใช้ของกลางตัวนี้ |
| --- | --- |
| อ่านค่า list จาก URL | `parseListParams` · `buildOrderBy` · `buildQueryString` (`src/lib/query.ts`) |
| แบ่งหน้าที่ DB | `paginate` (`src/lib/query.ts`) |
| ตาราง | `<DataTable />` (`src/components/shared/data-table.tsx`) |
| แถบแบ่งหน้า / เลือกจำนวนต่อหน้า | `<DataTablePagination />` |
| ช่องค้นหา | `<SearchInput />` (debounce + เขียนลง URL) |
| optimistic CRUD | `useOptimisticList` (`src/hooks/use-optimistic-list.ts`) |
| ผลลัพธ์ action | `createAction` / `ActionResult` (`src/lib/action.ts`) |
| แจ้งเตือน | `notify` / `handleResult` (`src/lib/notify.ts`) |
| สิทธิ์ | `requireUser` / `requireRole` (`src/lib/auth.ts`) |
| ประวัติการเปลี่ยนแปลง (audit log) | `logAudit` / `logAuditMany` / `diffChanges` (`src/lib/audit.ts`) — เรียกใน `prisma.$transaction()` เดียวกับการเขียนข้อมูล |
| ชื่อ entity ในหน้าประวัติการใช้งาน | `src/config/audit.ts` (ของ project — `new:module` เพิ่มให้) |
| โลโก้ของแอป | `<BrandIcon />` (`src/config/brand.tsx` — ของ project) ห้ามใส่ไอคอนโลโก้ตรง ๆ ใน component |
| สีแบรนด์ | `src/styles/brand.css` (ของ project) — ห้ามแก้ `globals.css` |
| สร้าง module ใหม่ | `bun run new:module <ชื่อ>` (`scripts/new-module.ts` + `scaffold/module/`) |
| หัวข้อหน้า | `<PageHeader />` |
| สถานะว่าง | `<EmptyState />` |
| โหลด | `<PageSkeleton />` `<TableSkeleton />` `<StatCardsSkeleton />` `<FullPageLoader />` `<Spinner />` |
| ม่านโหลดระหว่างบันทึก | `<MutationOverlay />` — `mutate()` เปิดให้เอง; งานเขียนนอก `mutate()` ใช้ `beginMutation()`; อัปโหลดไฟล์ใช้ `beginProgress()` (แสดง % + แถบวิ่งจนเต็ม) (`src/components/shared/mutation-overlay.tsx`) |
| แถบโหลดด้านบน | มีอยู่แล้วทั้งระบบ — ถ้าเปลี่ยนหน้าด้วย `router.push()` เอง ให้เรียก `startRouteProgress()` ก่อน |
| ยืนยันก่อนทำรายการ | `<ConfirmDialog />` |
| ช่องกรอกราคา / จำนวนเงิน | `<AmountInput {...field} />` — คั่นหลักพันด้วย `.` (1.000 · 1.000.000) ทศนิยมด้วย `,` ส่งค่าออกเป็น number (`src/components/shared/amount-input.tsx`) ห้ามใช้ `<Input type="number">` กับเงิน |
| เลือกหลายแถว | `<DataTable selectable bulkActions={...} />` · `<Checkbox />` (`src/components/ui/checkbox.tsx`) |
| กรอบที่เลื่อนได้ | ใส่ class `scroll-area` (แถบเลื่อนใช้สีหลักอยู่แล้ว ดู `docs/THEMING.md`) |
| ข้อความหลายภาษา | `useI18n()` (client) · `getTranslations()` (server) · `t()` (นอก React) |
| จำนวนต่อหน้า | `<PageSizeSelect />` (DataTable ใส่ให้อยู่แล้ว) |
| สลับภาษา | `<LanguageSwitcher />` (อยู่ใน header แล้ว, ธงตั้งที่ `localeFlags` ใน `src/i18n/config.ts` → `public/img`) |
| สลับธีม | `<ThemeToggle />` — กดครั้งเดียวสลับ สว่าง ⇄ มืด |
| รูปโปรไฟล์ / อักษรย่อ | `<UserAvatar />` (`src/components/shared/user-avatar.tsx`) |
| รูปโปรไฟล์ของผู้ใช้ | เก็บใน `User.avatar` (bytes) + `User.image` (URL `/api/avatar/<id>?v=`) — อัปโหลด/แก้ชื่อ/เปลี่ยนรหัสที่หน้า `/profile` |
| ย่อรูปก่อนอัปโหลด | `resizeImageToDataUrl()` (`src/lib/image.ts`) |
| เมนูมือถือ | `<BottomNav />` + `<MobileMoreSheet />` |
| สถานะออนไลน์ | `User.lastSeenAt` + `isOnline()` / `onlineSince()` (`src/lib/presence.ts`) · heartbeat ส่งเองจาก `<PresenceHeartbeat />` ใน dashboard layout · จุดสถานะ `<OnlineDot />` |
| หน้าที่ต้องอัปเดตเองเป็นระยะ | `<LiveRefresh intervalMs={...} />` — `router.refresh()` ขณะแท็บเปิดอยู่ (client ไม่ fetch เอง) |

---

## 5. สิ่งที่ห้ามทำ

- ❌ `prisma.xxx.findMany()` แบบไม่มี `skip`/`take` ในหน้ารายการ
- ❌ เก็บหน้า/คำค้นไว้ใน `useState` แทน URL
- ❌ `await` server action แล้วค่อยปิด dialog (ทำให้ผู้ใช้รู้สึกช้า)
- ❌ เรียก `toast()` ตรง ๆ, `fetch("/api/...")` จาก client เพื่อดึงข้อมูลรายการ
- ❌ ประกาศ `ColumnDef` โดยไม่ใส่ `id` (ทำให้เรียงข้อมูลไม่ทำงาน)
- ❌ ส่ง `Decimal` หรือ `Date` ดิบจาก server component ไป client component
- ❌ แก้ไข server action โดยไม่เช็คสิทธิ์ด้วย `requireUser()` / `requireRole()`
- ❌ เขียน/แก้/ลบข้อมูลโดยไม่เรียก `logAudit()`/`logAuditMany()` หรือเรียกไว้นอก `prisma.$transaction()`
  ของการเขียนข้อมูลนั้น (ต้อง atomic กันเสมอ — ดูข้อ 2.3)
- ❌ ส่ง bytes/token จริง (avatar, password hash, access token ฯลฯ) เข้า `before`/`after` ของ `logAudit`
  โดยตรง — ให้ส่งค่าเบา ๆ ที่ปลอดภัยแทน (`diffChanges` redact ให้เองแต่ไม่ควรพึ่งมันเป็นด่านเดียว)
- ❌ เขียนข้อความภาษาไทย (หรือภาษาใด ๆ) ลงใน component ตรง ๆ แทนการใช้คีย์ i18n
- ❌ `toLocaleString()` / `formatDate()` โดยไม่ส่ง `intl` ของภาษาปัจจุบัน
- ❌ `router.push()` เปลี่ยนหน้าโดยไม่เรียก `startRouteProgress()` (ผู้ใช้จะไม่เห็นว่าระบบกำลังทำงาน)
- ❌ ทำ spinner/ม่านโหลดเต็มจอเองระหว่างบันทึกข้อมูล — ใช้ `<MutationOverlay />` กลางที่ `mutate()` เปิดให้อยู่แล้ว (ข้อ 2.2)
- ❌ ใส่ `loading` / spinner ในปุ่ม create / update / delete — สถานะบันทึกแสดงด้วยม่านโหลดเต็มจอเท่านั้น
- ❌ ทำเมนูมือถือเองเป็นปุ่มแฮมเบอร์เกอร์ — ระบบใช้แถบปุ่มล่างจอเป็นมาตรฐาน
- ❌ วางปุ่มหรือเนื้อหาชิดขอบล่างโดยไม่เผื่อ `env(safe-area-inset-bottom)`
- ❌ แก้ไฟล์ core ของ template ใน project (ดู `template.json`) — ใช้จุดต่อขยายใน `docs/EXTENDING.md` หรือส่งการแก้กลับไปที่ repo template
- ❌ แก้เทสต์ใน `tests/conventions/` ให้ผ่าน — ถ้าตั้งใจยกเว้นจริงให้ใส่ป้าย (เช่น `@audit-exempt`) พร้อมเหตุผลในไฟล์นั้น
- ❌ copy โฟลเดอร์ module เอง — ใช้ `bun run new:module`

---

## 6. คำสั่ง

```bash
bun install
bun run dev
bun run typecheck
bun test
bun run db:push / db:migrate / db:studio / db:seed
bun run new:module <ชื่อ>      # สร้าง module ใหม่ตามมาตรฐาน
bun run template:check         # ตรวจว่าแก้ไฟล์ core ของ template ไปหรือไม่
bun run scaffold:sync          # (เฉพาะ repo template) หลังแก้ module products
```

เอกสารอื่น: `README.md` (ภาพรวม) · `docs/ARCHITECTURE.md` (การไหลของข้อมูล) ·
`docs/THEMING.md` (design token) · `docs/I18N.md` (หลายภาษา) · `docs/TESTING.md` (เทสต์) ·
`docs/NEW-PROJECT.md` (เริ่ม project ใหม่) · `docs/EXTENDING.md` (core / project, จุดต่อขยาย, รับอัปเดต) ·
`docs/PWA.md` (ติดตั้งเป็นแอป / ออฟไลน์) · `CHANGELOG.md` (เปลี่ยนอะไรในแต่ละรุ่น)
