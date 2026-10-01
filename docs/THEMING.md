# Theming — เปลี่ยนหน้าตาโดยไม่แตะโครงสร้าง

ทุกสีในระบบมาจากตัวแปร CSS ใน `src/app/globals.css` (ของ template)
แต่ละ project **override ที่ `src/styles/brand.css` เท่านั้น** (โหลดต่อจาก globals.css) — ไม่แก้ `globals.css` เพื่อให้รับอัปเดตของ template ได้
component ทุกตัวอ้างถึง token ผ่าน utility class ของ Tailwind (`bg-primary`, `text-muted-foreground`, ...)

## 1. เปลี่ยนสีแบรนด์เร็วที่สุด

แก้ 2 บรรทัดใน `:root` (และคู่ของมันใน `.dark`):

```css
:root {
  --primary: oklch(0.55 0.19 258);          /* สีหลัก */
  --primary-foreground: oklch(0.98 0.005 258); /* สีตัวอักษรบนสีหลัก */
}
```

> ใช้ oklch เพราะปรับความสว่าง/ความจัดได้แยกกัน — เลขตัวแรกคือความสว่าง (0–1), ตัวที่สองคือความจัด, ตัวที่สามคือเฉดสี (0–360)

## 2. ใช้ชุดสีสำเร็จรูป

ใน `src/styles/themes/` มี `ocean.css`, `emerald.css`, `violet.css`
เปิดบรรทัดนี้ใน `src/styles/brand.css`:

```css
@import "./themes/ocean.css";
```

## 3. Token ที่มีให้ใช้

| กลุ่ม | token |
| --- | --- |
| พื้นหลัง/ตัวอักษร | `background`, `foreground`, `card`, `popover`, `muted`, `accent` |
| แบรนด์ | `primary`, `secondary` |
| สถานะ | `destructive`, `success`, `warning` |
| เส้น/ฟอร์ม | `border`, `input`, `ring` |
| sidebar | `sidebar`, `sidebar-primary`, `sidebar-accent`, `sidebar-border` |
| กราฟ | `chart-1` ถึง `chart-5` |
| ความโค้ง | `--radius` (คุมทั้งระบบจากค่าเดียว) |
| แถบเลื่อน | `--scrollbar-size`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `--scrollbar-track` |

ทุก token มีคู่ของมันใน `.dark` เสมอ — เพิ่ม token ใหม่ต้องเพิ่มทั้ง 2 ที่ แล้ว map ใน `@theme inline`

## 4. แถบเลื่อน (scrollbar)

แถบเลื่อนถูก custom ให้ใช้ **สีหลัก** อัตโนมัติ — เปลี่ยน `--primary` แล้วแถบเลื่อนเปลี่ยนตาม
ไม่ต้องแก้อะไรเพิ่ม ปรับได้ที่ `:root` ใน `src/styles/brand.css`:

```css
--scrollbar-size: 10px;                                              /* ความหนา */
--scrollbar-thumb: color-mix(in oklch, var(--primary) 45%, transparent);
--scrollbar-thumb-hover: color-mix(in oklch, var(--primary) 75%, transparent);
--scrollbar-track: color-mix(in oklch, var(--foreground) 5%, transparent);
```

- ใส่ class `scroll-area` ให้กรอบที่เลื่อนได้ (ตาราง, sidebar) เพื่อให้เห็นรางจาง ๆ จับง่ายขึ้น
- ใส่ class `scrollbar-none` เมื่ออยากซ่อนแถบเลื่อนแต่ยังเลื่อนได้ (เช่นแถบ tab แนวนอน)

## 5. ฟอนต์

ชุดฟอนต์เดียวทั้งระบบที่ `src/app/fonts.ts` (`appFontStack`) ส่งเข้าตัวแปร `--font-app-sans` ที่ `<html>`
เบราว์เซอร์เลือกฟอนต์ให้เองรายตัวอักษร: อังกฤษ = Times New Roman, ไทย = Sarabun,
ลาว = Phetsarath OT, จีน = Noto Sans SC — ไม่ผูกกับภาษาที่เลือกใน UI (รายละเอียดใน `docs/I18N.md`)

## 6. Dark mode

ใช้ `next-themes` (`class` strategy) ปุ่มสลับอยู่ที่ `src/components/theme-toggle.tsx`
ค่าเริ่มต้นตั้งที่ `src/config/site.ts` → `defaultTheme`
