-- หน้าโพย: จำว่าผู้ใช้ดูโพยของแต่ละกลุ่มถึงเวลาไหนแล้ว — โพยที่เข้ามาหลังจากนั้นขึ้นเป็น "ยังไม่ได้ดู"

-- CreateTable
CREATE TABLE "ticket_seen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_seen_userId_dealerId_groupKey_key" ON "ticket_seen"("userId", "dealerId", "groupKey");

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
