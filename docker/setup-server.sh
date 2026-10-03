#!/usr/bin/env bash
# ตั้งค่าเซิร์ฟเวอร์ครั้งเดียว — หลังจากนี้ push ขึ้น main แล้ว deploy อัตโนมัติ
#
# ใช้กับเซิร์ฟเวอร์ Linux (Ubuntu/Debian) ในวงแลน — เครื่องเดียวกับ SACDMS ได้ (ใช้ Docker ตัวเดิม แต่ runner / user /
# โฟลเดอร์ / พอร์ต แยกจาก SACDMS ทั้งหมด) ต้องออกเน็ตได้ (github.com, ghcr.io, docker hub) แต่ไม่ต้องเปิดให้ใครเข้ามา
#
#   1. GitHub → repo khamta/Lottery → Settings → Actions → Runners → New self-hosted runner → คัดลอก token
#      (บรรทัด ./config.sh ... --token XXXXX — token ใช้ได้ 1 ชั่วโมง)
#   2. คัดลอกไฟล์นี้ขึ้นเซิร์ฟเวอร์ (repo private: scp/วางเอง) แล้ว:
#        sudo bash setup-server.sh --token XXXXX
#   3. GitHub → Actions → Build & Deploy → Run workflow  (หรือ push ขึ้น main)
#
# ตัวเลือก:
#   --token T        runner registration token (จำเป็น)
#   --repo O/R       ค่าเริ่มต้น khamta/Lottery
#   --ip ADDR        IP ที่เครื่องในวงแลนใช้เข้าแอป (ค่าเริ่มต้น: ตรวจจากเครื่องเอง — ใช้แค่แสดงผลตอนจบ)
#   --dir PATH       โฟลเดอร์ deploy (ค่าเริ่มต้น /opt/lottery — ถ้าเปลี่ยน ต้องตั้ง variable DEPLOY_PATH ใน GitHub ด้วย)
#
# รันซ้ำได้: ข้ามส่วนที่ทำไปแล้ว ไม่เขียนทับ .env เดิม
set -euo pipefail

REPO="khamta/Lottery"
TOKEN=""
LAN_IP=""
DEPLOY_PATH="/opt/lottery"
RUNNER_USER="lottery"
RUNNER_LABEL="lottery"
# runner ของ SACDMS อยู่ที่ /opt/actions-runner — ห้ามใช้โฟลเดอร์เดียวกัน (runner หนึ่งตัวผูกได้ repo เดียว)
RUNNER_DIR="/opt/actions-runner-lottery"
APP_PORT=3002
STUDIO_PORT=5556

while [ $# -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --ip) LAN_IP="$2"; shift 2 ;;
    --dir) DEPLOY_PATH="$2"; shift 2 ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
[ -n "$TOKEN" ] || { echo "missing --token (GitHub → Settings → Actions → Runners → New self-hosted runner)"; exit 1; }
[ -n "$LAN_IP" ] || LAN_IP="$(hostname -I | awk '{print $1}')"

# apt/needrestart ห้ามถามอะไร (Ubuntu 22.04+ จะเปิดเมนู "Restarting services" ค้างรอ ซึ่งมองไม่เห็นเพราะ >/dev/null)
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

# ---------- 1. Docker (มีอยู่แล้วจาก SACDMS — ข้าม) ----------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
docker compose version >/dev/null

# ---------- 2. พอร์ตต้องว่าง (SACDMS ใช้ 3001, 9980, 5555 · apache2 ใช้ 80) ----------
for port in "$APP_PORT" "$STUDIO_PORT"; do
  if ss -ltnH "sport = :$port" | grep -q . && ! docker ps --format '{{.Names}}' | grep -qx lottery-caddy; then
    echo "port $port is already in use:"; ss -ltnp "sport = :$port"; exit 1
  fi
done

# ---------- 3. user ที่รัน runner + deploy ----------
if ! id "$RUNNER_USER" >/dev/null 2>&1; then
  log "creating user $RUNNER_USER"
  useradd --create-home --shell /bin/bash "$RUNNER_USER"
fi
usermod -aG docker "$RUNNER_USER"

# ---------- 4. โฟลเดอร์ deploy + .env ----------
log "preparing $DEPLOY_PATH"
install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$DEPLOY_PATH" "$DEPLOY_PATH/docker" "$DEPLOY_PATH/uploads"

if [ ! -f "$DEPLOY_PATH/.env" ]; then
  log "writing $DEPLOY_PATH/.env (secrets generated)"
  rand() { openssl rand -base64 32 | tr -d '/+=' | cut -c1-32; }
  cat > "$DEPLOY_PATH/.env" <<EOF
# สร้างโดย docker/setup-server.sh — แก้ได้ แล้ว: cd $DEPLOY_PATH && docker compose -f docker-compose.prod.yml up -d
# http://:พอร์ต = รับทุก host (IP วงแลน, public IP ผ่าน NAT/port-forward) — ถ้าใส่ IP ตรง ๆ Caddy จะตอบหน้าว่างให้ host อื่น
APP_SITE="http://:$APP_PORT"

POSTGRES_USER="lottery"
POSTGRES_PASSWORD="$(rand)"
POSTGRES_DB="lottery"

AUTH_SECRET="$(openssl rand -base64 32)"
EOF
  chown "$RUNNER_USER:$RUNNER_USER" "$DEPLOY_PATH/.env"
  chmod 600 "$DEPLOY_PATH/.env"
else
  echo "$DEPLOY_PATH/.env exists — keeping it"
fi

# ---------- 5. GitHub Actions runner (service) ----------
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  log "installing GitHub Actions runner → $RUNNER_DIR"
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) echo "unsupported arch $(uname -m)"; exit 1 ;;
  esac
  # โหลด JSON ทั้งก้อนก่อนแล้วค่อยหา — ถ้า pipe เข้า `grep -m1` ตรง ๆ grep จะปิดท่อก่อน curl เขียนเสร็จ
  # (curl: (23) Failure writing output) และ pipefail จะทำให้สคริปต์หยุด
  RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)"
  VERSION="$(printf '%s\n' "$RELEASE_JSON" | sed -nE 's/.*"tag_name": *"v([^"]+)".*/\1/p')"
  [ -n "$VERSION" ] || { echo "could not read latest runner version"; exit 1; }
  echo "runner v$VERSION ($ARCH)"
  install -d "$RUNNER_DIR"
  cd "$RUNNER_DIR"
  TARBALL="$(mktemp /tmp/actions-runner.XXXXXX.tar.gz)"
  curl -fSL --progress-bar -o "$TARBALL" \
    "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-${ARCH}-${VERSION}.tar.gz" \
    || { echo "download failed — check internet access to github.com and free space: df -h /tmp $RUNNER_DIR"; exit 1; }
  tar xzf "$TARBALL" -C "$RUNNER_DIR"
  rm -f "$TARBALL"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"
  log "installing runner dependencies (apt)"
  # ข้อความ "Unable to locate package liblttng-ust1t64" ไม่เป็นไร — สคริปต์ของ GitHub จะลองชื่อแพ็กเกจอื่นต่อเอง
  ./bin/installdependencies.sh

  runuser -u "$RUNNER_USER" -- ./config.sh --unattended --replace \
    --url "https://github.com/$REPO" --token "$TOKEN" \
    --name "$(hostname)-lottery" --labels "$RUNNER_LABEL" --work _work

  # ชื่อ service = actions.runner.khamta-Lottery.<ชื่อ> — ไม่ชนกับ service ของ runner SACDMS
  ./svc.sh install "$RUNNER_USER"
  ./svc.sh start
else
  echo "runner already configured in $RUNNER_DIR — skipping"
  (cd "$RUNNER_DIR" && ./svc.sh start >/dev/null 2>&1 || true)
fi

# ---------- 6. firewall (ถ้าใช้ ufw) ----------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  log "opening ports $APP_PORT, $STUDIO_PORT (ufw)"
  ufw allow "$APP_PORT/tcp" >/dev/null
  ufw allow "$STUDIO_PORT/tcp" >/dev/null
fi

log "done"
cat <<EOF
  แอป:           http://$LAN_IP:$APP_PORT   (หลัง deploy ครั้งแรก — บัญชีแรกสร้างจาก prisma/seed.ts)
  Prisma Studio: http://$LAN_IP:$STUDIO_PORT  (user/รหัสผ่าน: STUDIO_USER / STUDIO_PASSWORD ใน .env — deploy แรกสร้างให้)
  ค่าต่าง ๆ:      $DEPLOY_PATH/.env

  ขั้นต่อไป: GitHub → Actions → Build & Deploy → Run workflow  (หรือ push ขึ้น main)
EOF
