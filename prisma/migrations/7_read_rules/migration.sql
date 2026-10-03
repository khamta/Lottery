-- เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเอง (หน้า /read-rules · src/lottery/read-rules.ts)

-- CreateEnum
CREATE TYPE "ReadRuleKind" AS ENUM ('SKIP', 'REPLACE', 'PATTERN');

-- CreateTable
CREATE TABLE "read_rules" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "kind" "ReadRuleKind" NOT NULL,
    "find" TEXT NOT NULL,
    "replace" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "read_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "read_rules_dealerId_isActive_createdAt_idx" ON "read_rules"("dealerId", "isActive", "createdAt");

-- AddForeignKey
ALTER TABLE "read_rules" ADD CONSTRAINT "read_rules_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
