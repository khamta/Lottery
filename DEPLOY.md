# Deploy (GitHub Actions → GHCR → เซิร์ฟเวอร์ในวงแลน เครื่องเดียวกับ SACDMS)

ใช้วิธีเดียวกับ SACDMS: เซิร์ฟเวอร์อยู่ในวงแลน **ไม่มี public IP** — GitHub เข้าไปหาเซิร์ฟเวอร์ไม่ได้ จึงติดตั้ง
**GitHub Actions self-hosted runner** ไว้บนเซิร์ฟเวอร์ runner ต่อ "ออก" ไปที่ GitHub เพื่อรับงาน deploy เอง

runner ของ SACDMS ผูกกับ repo `khamta/SACDMS` ใช้กับ repo นี้ไม่ได้ จึงติดตั้ง **runner ตัวที่สอง** แยกกันทั้งหมด:

|                 | SACDMS (มีอยู่แล้ว)          | Lottery (ตัวนี้)                  |
| --------------- | --------------------------- | -------------------------------- |
| โฟลเดอร์ deploy  | `/opt/sacdms`               | `/opt/lottery`                   |
| runner          | `/opt/actions-runner` · label `sacdms` | `/opt/actions-runner-lottery` · label `lottery` |
| user            | `sacdms`                    | `lottery`                        |
| พอร์ต           | 3001 (แอป) · 9980 · 5555     | **3002** (แอป) · **5556** (Prisma Studio) |
| container / volume / network | `sacdms-*`     | `lottery-*`                      |

Docker ตัวเดียวกัน แต่ไม่มีอะไรใช้ร่วมกัน — deploy / restart / ลบ ฝั่งหนึ่งไม่กระทบอีกฝั่ง

ทุกครั้งที่ push ขึ้น `main` workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) จะ:

1. **test** (บน GitHub) — `bun run typecheck` + `bun test`
2. **build** (บน GitHub) — build 2 image แล้ว push ไป GHCR (tag `latest` และ `sha-xxxxxxx`)
   - `ghcr.io/khamta/lottery` จาก [`Dockerfile`](Dockerfile) — ใช้กับ app / worker / migrate / studio
   - `ghcr.io/khamta/lottery-ocr` จาก [`ocr/Dockerfile`](ocr/Dockerfile)
3. **deploy** (บนเซิร์ฟเวอร์ ผ่าน runner) — คัดลอก `docker-compose.prod.yml`, `docker/Caddyfile` ไปที่ `/opt/lottery`
   แล้ว `docker compose pull && up -d` ด้วย image ของ commit นั้น (migrate ทำ migration ก่อนเว็บ/บอทเริ่ม) รอจนแอปตอบ

Pull request รันแค่ test + build (ไม่ push, ไม่ deploy) — กด deploy ด้วยมือได้ที่ Actions → Build & Deploy → Run workflow

## ตั้งค่าครั้งเดียว

1. **เอา token ของ runner:** GitHub → repo `khamta/Lottery` → Settings → Actions → Runners → **New self-hosted runner** → Linux
   คัดลอกค่าหลัง `--token` จากบรรทัด `./config.sh ...` (ใช้ได้ภายใน 1 ชั่วโมง)
2. **คัดลอก [`docker/setup-server.sh`](docker/setup-server.sh) ขึ้นเซิร์ฟเวอร์** (repo เป็น private — ใช้ scp) แล้วรัน:

   ```bash
   scp docker/setup-server.sh <user>@<IP เซิร์ฟเวอร์>:/tmp/     # จากเครื่องนี้
   sudo bash /tmp/setup-server.sh --token <TOKEN>              # บนเซิร์ฟเวอร์
   ```

   สคริปต์จะ: ข้ามการติดตั้ง Docker (มีจาก SACDMS แล้ว) → ตรวจว่าพอร์ต 3002/5556 ว่าง → สร้าง user `lottery`
   → สร้าง `/opt/lottery/.env` พร้อมสุ่มรหัสผ่าน DB / AUTH_SECRET → ติดตั้ง runner เป็น service (เปิดเองหลัง reboot)
   → เปิดพอร์ตใน ufw (ถ้าใช้) — รันซ้ำได้ ไม่เขียนทับ `.env` เดิม
3. **deploy ครั้งแรก:** GitHub → Actions → Build & Deploy → **Run workflow** (หรือ push ขึ้น `main`)
   ครั้งแรกช้า (เซิร์ฟเวอร์ต้องโหลด image OCR ~1GB) ครั้งต่อไปโหลดเฉพาะส่วนที่เปลี่ยน
4. **ย้ายข้อมูลจากเครื่องนี้** (ถ้าต้องการ) — ดูหัวข้อถัดไป ไม่ย้าย = เริ่มฐานข้อมูลว่างพร้อมบัญชีแรกจาก `prisma/seed.ts`
5. **WhatsApp:** เปิด `http://<IP>:3002/whatsapp` แล้วสแกน QR ใหม่ (session ของบอทไม่ได้ย้ายมา)

เสร็จแล้ว — เครื่องในวงแลนเข้า `http://<IP ของเซิร์ฟเวอร์>:3002` และหลังจากนี้แค่ push ขึ้น `main` ก็ deploy เอง

ไม่ต้องตั้ง secret ใน GitHub (ใช้ `GITHUB_TOKEN` ของ workflow) ตั้ง **Variables** ได้ถ้าต้องการ (Settings → Secrets and variables → Actions):
`NEXT_PUBLIC_APP_URL` (เช่น `http://192.168.1.50:3002` หรือโดเมน), `NEXT_PUBLIC_APP_NAME`, `DEPLOY_PATH` (ถ้าใช้ `--dir` อื่น)

## ย้ายข้อมูลจากเครื่องนี้ไปเซิร์ฟเวอร์

ทำหลัง deploy ครั้งแรกสำเร็จ (ฐานข้อมูลบนเซิร์ฟเวอร์ถูกสร้างแล้ว) — ข้อมูลบนเซิร์ฟเวอร์จะถูก **แทนที่ทั้งหมด**

**⚠ หยุดบอทบนเครื่องนี้ก่อน** (`docker compose stop worker`) — บอทสองตัวที่ใช้เบอร์ WhatsApp เดียวกันจะแย่งกันและนับโพยซ้ำ

บนเครื่องนี้ (PowerShell) — dump ในตัว container แล้ว `docker cp` ออกมา (redirect `>` ของ PowerShell ทำไฟล์เสีย):

```powershell
docker exec lottery-db sh -c "pg_dump -U postgres --no-owner --no-acl lottery_db | gzip > /tmp/lottery.sql.gz"
docker cp lottery-db:/tmp/lottery.sql.gz .
tar -czf uploads.tgz uploads
scp lottery.sql.gz uploads.tgz <user>@<IP เซิร์ฟเวอร์>:/tmp/
```

บนเซิร์ฟเวอร์:

```bash
cd /opt/lottery
C="sudo -u lottery docker compose -f docker-compose.prod.yml"
$C stop app worker studio
$C exec -T db psql -U lottery -d postgres -c "DROP DATABASE lottery WITH (FORCE);" -c "CREATE DATABASE lottery;"
gunzip -c /tmp/lottery.sql.gz | $C exec -T db psql -q -U lottery -d lottery -v ON_ERROR_STOP=1
sudo tar -xzf /tmp/uploads.tgz -C /opt/lottery          # → /opt/lottery/uploads/
$C up -d                                                # migrate ทำ migration ที่ยังขาดให้เอง
rm /tmp/lottery.sql.gz /tmp/uploads.tgz                 # มีข้อมูลลูกค้า — อย่าทิ้งไว้
```

บัญชีผู้ใช้ทั้งหมดมาจากเครื่องนี้ (login ด้วยรหัสเดิม) แล้วสแกน QR WhatsApp ใหม่ที่ `/whatsapp`

## โครงสร้างบนเซิร์ฟเวอร์

```
caddy :3002 ──► app:3000          APP_SITE http://:3002 (ทุก host)
      :5556 └─► studio:5555       Prisma Studio — basic auth (STUDIO_USER / STUDIO_PASSWORD ใน .env) วงแลนเท่านั้น
migrate (รันแล้วจบ) ──► db         prisma migrate deploy · บัญชีแรก · ย้ายรูปเก่า
app / worker ──► db:5432          (ทั้งหมดอยู่ใน network lottery-net)
worker ──► ocr:8000               อ่านรูปโพย · ──ออก──► WhatsApp
runner (service) ──ออก──► github.com
```

ข้อมูลอยู่ที่: volume `lottery-pgdata` (ฐานข้อมูล), `lottery-wa-auth` (session WhatsApp), โฟลเดอร์ `/opt/lottery/uploads` (รูปโพย)

## เข้าผ่านโดเมน (HTTPS)

เหมือน SACDMS: ให้เซิร์ฟเวอร์ที่มีโดเมน/ใบรับรองทำ HTTPS แล้วส่งต่อมาที่ `http://<IP>:3002` (ถ้าอยู่คนละวง ต้อง port-forward
พอร์ตใหม่ที่ router ด้วย เช่นเดียวกับ `30011 → 3001` ของ SACDMS) แล้วตั้ง `TRUSTED_PROXIES="<IP ของเซิร์ฟเวอร์นั้น>"`
ใน `/opt/lottery/.env` และ GitHub variable `NEXT_PUBLIC_APP_URL` เป็น URL จริง

แอปนี้รัน **ที่รากของโดเมน** (ไม่มี basePath แบบ `/dms` ของ SACDMS) — ใช้ subdomain เช่น `lottery.example.com`
ถ้าต้องการใต้ path ย่อย (`task-report.sdplao.com/lottery/`) ต้องเพิ่ม basePath ในโค้ดก่อน

ตัวอย่าง nginx:

```nginx
server {
    listen 443 ssl;
    server_name lottery.example.com;
    # ... ssl_certificate ...
    location / {
        proxy_pass http://<IP>:<พอร์ต>;
        proxy_http_version 1.1;
        # ต้องส่ง Host เดิม — Next.js ตรวจ Origin ของ Server Actions เทียบกับ Host
        # ไม่ส่ง = ทุกปุ่มบันทึก/ลบจะ error "Invalid Server Actions request"
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        client_max_body_size 20m;
    }
}
```

## งานประจำ

```bash
cd /opt/lottery
C="sudo -u lottery docker compose -f docker-compose.prod.yml"
$C ps
$C logs -f worker                         # บอท WhatsApp
$C logs -f app
systemctl status 'actions.runner.khamta-Lottery.*'

# อ่านรูปโพยในงวดที่เปิดอยู่ใหม่ (หลังแก้กฎการอ่าน) — ดู LOTTERY.md
$C exec worker bun worker/ocr-reapply.ts

# rollback: Actions → เลือก run ของ commit ที่ต้องการ → Re-run jobs

# อัปเดต Caddy / Postgres เป็นครั้งคราว (deploy ดึงเฉพาะ image ของเรา)
$C pull caddy db && $C up -d caddy db
# postgres: อัปเดตเฉพาะ minor (17.x) ตาม tag 17-alpine — ห้ามเปลี่ยน major โดยไม่ dump/restore

# backup — ต้องสำรองทั้งฐานข้อมูล และ uploads
$C exec -T db pg_dump -U lottery lottery | gzip > lottery-$(date +%F).sql.gz
sudo tar -czf lottery-uploads-$(date +%F).tgz -C /opt/lottery uploads
```

## ข้อควรรู้

- ในวงแลนใช้ **HTTP ธรรมดา** — ไม่เข้ารหัส เหมาะกับเครือข่ายภายในที่ไว้ใจได้
- self-hosted runner รันโค้ดจาก workflow ของ repo นี้บนเซิร์ฟเวอร์ — **ปลอดภัยเพราะ repo เป็น private**
  ห้ามเปลี่ยน repo เป็น public ขณะที่ runner ยังผูกอยู่ (PR จาก fork จะสั่งงานบนเซิร์ฟเวอร์ได้)
- schema เปลี่ยนผ่าน `prisma migrate` เท่านั้น (ไฟล์ใน `prisma/migrations/`) — service `migrate` ทำให้ก่อนแอปเริ่มทุก deploy
  ถ้า migration ล้ม deploy จะ fail พร้อม log ของ migrate และเว็บ/บอทจะไม่เริ่ม — แก้แล้ว push ใหม่ หรือ rollback
- user `lottery` อยู่ในกลุ่ม `docker` = มีสิทธิ์เท่า root บนเครื่อง (เหมือน user `sacdms`)
