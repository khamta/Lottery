/**
 * คัดลอก module products (ต้นแบบ) ไปเป็น scaffold/module/*.tpl
 * ใช้ใน repo ของ template หลังแก้ products — project ปลายทางไม่ต้องรัน
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ROOT, SCAFFOLD_DIR, SCAFFOLD_FILES } from "./scaffold";

for (const file of SCAFFOLD_FILES) {
  const source = join(ROOT, file.source);
  if (!existsSync(source)) {
    console.error(`✗ ไม่พบ ${file.source} — scaffold:sync ต้องรันใน repo ที่ยังมี module products`);
    process.exit(1);
  }
  const target = join(SCAFFOLD_DIR, file.scaffold);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(source, "utf8"));
  console.log(`✓ ${file.source} → scaffold/module/${file.scaffold}`);
}
