-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "public"."BetPosition" AS ENUM ('TOP', 'BOTTOM');

-- CreateEnum
CREATE TYPE "public"."Currency" AS ENUM ('LAK', 'THB');

-- CreateEnum
CREATE TYPE "public"."DrawStatus" AS ENUM ('OPEN', 'CLOSED', 'SETTLED');

-- CreateEnum
CREATE TYPE "public"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "public"."TicketSource" AS ENUM ('MANUAL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('CONFIRMED', 'REVIEW');

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "action" "public"."AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "changes" JSONB,
    "userId" TEXT,
    "userName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bets" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "position" "public"."BetPosition" NOT NULL,
    "currency" "public"."Currency" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "lakMultiplier" INTEGER NOT NULL DEFAULT 1000,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."draws" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "drawDate" DATE NOT NULL,
    "status" "public"."DrawStatus" NOT NULL DEFAULT 'OPEN',
    "topResult" TEXT,
    "bottomResult" TEXT,
    "rate2Top" DECIMAL(8,2) NOT NULL,
    "rate2Bottom" DECIMAL(8,2) NOT NULL,
    "rate3Top" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."number_limits" (
    "id" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "position" "public"."BetPosition" NOT NULL,
    "currency" "public"."Currency" NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tickets" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "customerId" TEXT,
    "source" "public"."TicketSource" NOT NULL DEFAULT 'MANUAL',
    "status" "public"."TicketStatus" NOT NULL,
    "rawText" TEXT NOT NULL,
    "lakMultiplier" INTEGER NOT NULL,
    "note" TEXT,
    "issues" JSONB,
    "totalLak" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalThb" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "betCount" INTEGER NOT NULL DEFAULT 0,
    "waMessageId" TEXT,
    "senderId" TEXT,
    "senderName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "avatar" BYTEA,
    "avatarType" TEXT,
    "password" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "public"."accounts"("provider" ASC, "providerAccountId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "public"."audit_logs"("entity" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId" ASC);

-- CreateIndex
CREATE INDEX "bets_drawId_digits_position_currency_number_idx" ON "public"."bets"("drawId" ASC, "digits" ASC, "position" ASC, "currency" ASC, "number" ASC);

-- CreateIndex
CREATE INDEX "bets_ticketId_idx" ON "public"."bets"("ticketId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "public"."categories"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "public"."categories"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "public"."customers"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "public"."customers"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "draws_name_key" ON "public"."draws"("name" ASC);

-- CreateIndex
CREATE INDEX "draws_status_drawDate_idx" ON "public"."draws"("status" ASC, "drawDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "number_limits_digits_number_position_currency_key" ON "public"."number_limits"("digits" ASC, "number" ASC, "position" ASC, "currency" ASC);

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "public"."products"("categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "public"."products"("sku" ASC);

-- CreateIndex
CREATE INDEX "products_status_idx" ON "public"."products"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "public"."sessions"("sessionToken" ASC);

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "public"."tickets"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "tickets_customerId_idx" ON "public"."tickets"("customerId" ASC);

-- CreateIndex
CREATE INDEX "tickets_drawId_status_idx" ON "public"."tickets"("drawId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "tickets_senderId_createdAt_idx" ON "public"."tickets"("senderId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_waMessageId_key" ON "public"."tickets"("waMessageId" ASC);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "users_lastSeenAt_idx" ON "public"."users"("lastSeenAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "public"."verification_tokens"("identifier" ASC, "token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "public"."verification_tokens"("token" ASC);

-- AddForeignKey
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "public"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "public"."draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

