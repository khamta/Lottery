# image เดียวใช้ได้ 3 บทบาท (ดู docker-compose.yml): migrate · app (เว็บ) · worker (บอท WhatsApp)
#   เว็บรันด้วย Node (next start) · บอทและสคริปต์ฐานข้อมูลรันด้วย Bun (อ่าน TypeScript ได้ตรง ๆ)
FROM oven/bun:1.3.1 AS bun

FROM node:22-bookworm-slim AS base
# openssl = Prisma engine · tini = ส่งสัญญาณ docker stop ให้โปรเซสปิดตัวเรียบร้อย (บอทต้องปิดการเชื่อมต่อก่อนออก)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV TZ=Asia/Vientiane \
    NEXT_TELEMETRY_DISABLED=1

# ---- dependencies (cache แยกจากโค้ด: แก้โค้ดแล้วไม่ต้องติดตั้งใหม่)
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ---- build เว็บ — ค่า NEXT_PUBLIC_* ถูกฝังตอน build จึงต้องส่งเป็น build arg
FROM deps AS build
ARG NEXT_PUBLIC_APP_NAME="Lottery"
ARG NEXT_PUBLIC_APP_URL="http://localhost:3010"
ARG NEXT_PUBLIC_TIME_ZONE="Asia/Vientiane"
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_TIME_ZONE=$NEXT_PUBLIC_TIME_ZONE
COPY . .
# build ไม่ได้ต่อฐานข้อมูลจริง แต่ Prisma/Auth.js ต้องมีค่าให้อ่าน
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" AUTH_SECRET="build-only" bun run build

# ---- runtime
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
