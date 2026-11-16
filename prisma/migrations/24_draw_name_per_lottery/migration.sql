-- ชื่องวดห้ามซ้ำเฉพาะในประเภทหวยเดียวกัน — หวยลาวกับหวยไทย (และหวยเวียดนาม) เปิดงวดวันเดียวกันได้

-- DropIndex
DROP INDEX "draws_dealerId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "draws_dealerId_lottery_name_key" ON "draws"("dealerId", "lottery", "name");
