# Testing

ใช้ **bun test** (มาพร้อม Bun — ไม่ต้องลง jest/vitest) + Testing Library สำหรับ component

```bash
bun test                 # รันทั้งหมด
bun test:watch           # รันใหม่อัตโนมัติเมื่อแก้ไฟล์
bun test:coverage        # ดู coverage (ตั้ง threshold ไว้ที่ 60% ใน bunfig.toml)
bun test tests/unit      # รันเฉพาะโฟลเดอร์
bun test -t "SKU ซ้ำ"    # รันเฉพาะเทสต์ที่ชื่อตรง
```

## โครงสร้าง

```
bunfig.toml              # preload tests/setup.ts ให้ทุกไฟล์เทสต์
tests/
  setup.ts               # ติดตั้ง happy-dom เป็น global DOM + ตั้ง timezone
  unit/
    utils.test.ts        # ฟังก์ชัน helper
    validations.test.ts  # zod schema ทุกตัว
    action.test.ts       # createAction / toActionError
    audit.test.ts         # diffChanges (normalize/redact) + logAudit/logAuditMany
    query.test.ts        # parseListParams / paginate / buildOrderBy / buildQueryString
    optimistic.test.ts   # reducer ของ optimistic update
    route-progress.test.ts  # แถบโหลดด้านบน (start/creep/finish)
    i18n.test.ts         # คีย์ครบทุกภาษา + ตัวแปรในข้อความตรงกัน
  components/
    button.test.tsx      # UI component ด้วย @testing-library/react
    empty-state.test.tsx
    data-table-pagination.test.tsx   # แบ่งหน้า + เลือกจำนวนต่อหน้า (mock next/navigation)
    bottom-nav.test.tsx  # เมนูล่างจอมือถือ: สิทธิ์ + แท็บที่ active
  server/
    product-actions.test.ts   # ★ แม่แบบการเทสต์ server action (new:module สร้างให้ทุก module)
  conventions/                # ★ ตรวจกฎใน AGENTS.md กับทุก module อัตโนมัติ (ห้ามแก้ใน project)
```

## 3 ระดับที่ควรเขียนต่อทุก module ใหม่

| ระดับ | เทสต์อะไร | ดูตัวอย่างที่ |
| --- | --- | --- |
| Validation | schema ผ่าน/ไม่ผ่านตามที่ออกแบบ, การ coerce ค่า | `tests/unit/validations.test.ts` |
| Server action | เรียก prisma ถูกตัว, สิทธิ์, error mapping, revalidate | `tests/server/product-actions.test.ts` |
| Component | สิ่งที่ผู้ใช้เห็น/กดได้ (ไม่เทสต์ class ที่ไม่มีความหมาย) | `tests/components/button.test.tsx` |
| Pagination/Query | หน้า/จำนวนต่อหน้า/คำค้น แปลงเป็น skip-take ถูกต้อง | `tests/unit/query.test.ts` |
| Optimistic | create/update/delete เปลี่ยน state บนจอถูกต้อง | `tests/unit/optimistic.test.ts` |

## การ mock

`bun:test` มี `mock.module()` ใช้แทนฐานข้อมูลจริงได้ — ต้องเรียก **ก่อน** import ตัว action:

```ts
mock.module("@/lib/prisma", () => ({ prisma: { product: { create: async () => ({ id: "1" }) } } }));
mock.module("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1", role: "ADMIN" }) }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
// component ที่อ่าน URL ให้ mock next/navigation (ดู tests/components/data-table-pagination.test.tsx)

const { createProduct } = await import("@/app/(dashboard)/products/actions");
```

ทำให้เทสต์รันได้โดยไม่ต้องมีฐานข้อมูล เร็วและใช้ใน CI ได้ทันที

> อยากเทสต์กับฐานข้อมูลจริง: ใช้ PostgreSQL แยก 1 ตัว ตั้ง `DATABASE_URL` ใน `.env.test`
> แล้ว `bun run db:push` ก่อนรัน — ไม่ต้อง mock prisma ในไฟล์นั้น

## CI

`.github/workflows/ci.yml` รัน `typecheck` → `test` → `build` ทุก push/PR ด้วย Bun
