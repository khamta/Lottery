# PWA — ติดตั้งแอปลงมือถือ/คอมพิวเตอร์

แอปติดตั้งได้ทั้ง Android, iOS และ Chrome/Edge บนคอมพิวเตอร์ เปิดแบบเต็มจอเหมือนแอปทั่วไป
ไม่ใช้ library ภายนอก — มีไฟล์ไม่กี่ไฟล์ แก้ได้เอง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `src/config/site.ts` → `pwa` | ชื่อย่อ, หน้าแรกตอนเปิดแอป, สีไอคอน |
| `src/app/manifest.ts` | Web App Manifest (`/manifest.webmanifest`) |
| `src/lib/pwa-icon.tsx` | วาดไอคอนเป็น PNG จากโลโก้ (ไม่ต้องเก็บไฟล์รูป) |
| `src/app/icons/[name]/route.tsx` | ไอคอน 192 / 512 / maskable ที่ manifest อ้างถึง |
| `src/app/icon.tsx`, `src/app/apple-icon.tsx` | favicon และไอคอน iOS |
| `public/sw.js` | service worker |
| `src/components/shared/service-worker.tsx` | ลงทะเบียน sw (เฉพาะ production) |
| `src/app/offline/page.tsx` | หน้าที่แสดงเมื่อไม่มีเน็ต (แปล 4 ภาษา คีย์ `pwa.*`) |

## กลยุทธ์ cache

ข้อมูลในระบบต้องสดเสมอ จึง **ไม่ cache หน้าเพจ, API หรือ server action**

- เปิดหน้า → ไปเน็ตก่อน ออฟไลน์ค่อยแสดง `/offline` (กลับมาออนไลน์แล้วโหลดใหม่เอง)
- `/_next/static/*` → cache-first (ชื่อไฟล์มี hash)
- `/icons`, `/fonts`, `/img` → stale-while-revalidate

แก้ `public/sw.js` ทุกครั้ง ให้เพิ่มค่า `VERSION` เพื่อล้าง cache เก่า

## ทดสอบ

service worker ปิดไว้ตอน `bun dev` (กันโค้ดเก่าค้าง) ให้ทดสอบด้วย

```bash
bun run build && bun run start
```

แล้วเปิด DevTools → Application → Manifest / Service workers
การติดตั้งต้องเป็น **https** (ยกเว้น `localhost`)

## เปลี่ยนโลโก้/สี

- สี: `siteConfig.pwa.brandColor` (ให้ใกล้ `--primary` ใน `globals.css`)
- โลโก้ในแอป: `src/config/brand.tsx` (`BrandIcon`)
- ไอคอนตอนติดตั้ง / splash: แก้ SVG ใน `renderAppIcon()` และใน `AppSplash` ให้ตรงกับ `BrandIcon`
- ชื่อย่อใต้ไอคอน: `NEXT_PUBLIC_APP_SHORT_NAME` ใน `.env`
