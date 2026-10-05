-- หน้าโพย: โพยที่ผู้ใช้เปิดหน้าตรวจดูแล้วทีละใบ — หายจากตัวนับยังไม่ได้ดูโดยไม่ต้องกด "ดูทั้งหมดแล้ว"

-- CreateTable
CREATE TABLE "ticket_reads" (
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_reads_pkey" PRIMARY KEY ("userId","ticketId")
);

-- CreateIndex
CREATE INDEX "ticket_reads_ticketId_idx" ON "ticket_reads"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_reads" ADD CONSTRAINT "ticket_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_reads" ADD CONSTRAINT "ticket_reads_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
