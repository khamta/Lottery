/**
 * สร้าง module ใหม่ตามมาตรฐานของ template
 *
 *   bun run new:module orders
 *   bun run new:module purchase-orders
 *   bun run new:module people --singular person
 *
 * ได้: page / loading / types / actions / _components (view, columns, dialog)
 *     + zod schema + ไฟล์ข้อความ 4 ภาษา + เทสต์ server action
 *     + ลงทะเบียนใน src/i18n/modules/index.ts และ src/config/audit.ts ให้เอง
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ROOT, SCAFFOLD_DIR, SCAFFOLD_FILES, isKebab, renameModule, toNames } from "./scaffold";

const args = process.argv.slice(2);
const singularFlag = args.indexOf("--singular");
const singular = singularFlag >= 0 ? args[singularFlag + 1] : undefined;
const name = args.find(
  (arg, i) => !arg.startsWith("--") && (singularFlag < 0 || i !== singularFlag + 1),
);

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!name) fail("ระบุชื่อ module แบบพหูพจน์ kebab-case เช่น bun run new:module orders");
if (!isKebab(name)) fail(`"${name}" ต้องเป็น kebab-case ตัวเล็ก เช่น orders หรือ purchase-orders`);
if (singular !== undefined && !isKebab(singular)) fail(`--singular ต้องเป็น kebab-case`);

const n = toNames(name, singular);
if (n.kebabPlural === n.kebabSingular) {
  fail(`ชื่อพหูพจน์กับเอกพจน์ซ้ำกัน ("${name}") — ใส่ --singular ให้ชัดเจน`);
}

const plan = SCAFFOLD_FILES.map((file) => ({
  from: join(SCAFFOLD_DIR, file.scaffold),
  to: file.target(n),
}));

for (const { from, to } of plan) {
  if (!existsSync(from)) fail(`ไม่พบแม่แบบ ${from}`);
  if (existsSync(join(ROOT, to))) fail(`มีไฟล์ ${to} อยู่แล้ว — ไม่เขียนทับ`);
}

for (const { from, to } of plan) {
  const target = join(ROOT, to);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renameModule(readFileSync(from, "utf8"), n));
  console.log(`✓ ${to}`);
}

/** แก้ไฟล์ทะเบียน — ถ้าหาตำแหน่งไม่เจอให้บอกผู้ใช้ไปเพิ่มเอง */
function register(file: string, apply: (text: string) => string | null, manual: string) {
  const path = join(ROOT, file);
  const next = existsSync(path) ? apply(readFileSync(path, "utf8")) : null;
  if (next === null) {
    console.warn(`! เพิ่มใน ${file} เอง: ${manual}`);
    return;
  }
  writeFileSync(path, next);
  console.log(`✓ ลงทะเบียนใน ${file}`);
}

const messagesName = `${n.camelPlural}Messages`;
const importLine = `import { ${messagesName} } from "./${n.kebabPlural}";`;

register(
  "src/i18n/modules/index.ts",
  (text) => {
    const list = /export const moduleMessages = \[([^\]]*)\] as const;/;
    const match = text.match(list);
    if (!match) return null;
    const items = match[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return text
      .replace(list, `export const moduleMessages = [${[...items, messagesName].join(", ")}] as const;`)
      .replace(/\n\nexport const moduleMessages/, `\n${importLine}\n\nexport const moduleMessages`);
  },
  `${importLine} แล้วใส่ ${messagesName} ใน moduleMessages`,
);

register(
  "src/config/audit.ts",
  (text) => {
    const end = text.lastIndexOf("};");
    if (end < 0) return null;
    return `${text.slice(0, end)}  ${n.pascalSingular}: "auditLogs.entity${n.pascalSingular}",\n${text.slice(end)}`;
  },
  `${n.pascalSingular}: "auditLogs.entity${n.pascalSingular}",`,
);

console.log(`
เสร็จแล้ว — ขั้นต่อไป (รายละเอียดใน AGENTS.md หัวข้อ 3):
  1. prisma/schema.prisma → เพิ่ม model ${n.pascalSingular} (ดูแบบจาก model Product) แล้ว bun run db:push
  2. src/lib/validations/${n.kebabSingular}.ts → แก้ฟิลด์ให้ตรงกับ model
  3. src/app/(dashboard)/${n.kebabPlural}/ → แก้ types.ts / page.tsx (select, where) / columns / dialog
  4. src/i18n/modules/${n.kebabPlural}.ts → แก้ข้อความทั้ง 4 ภาษา (ตอนนี้ยังเป็นข้อความของสินค้า)
  5. src/config/nav.ts → { titleKey: "nav.${n.camelPlural}", href: "/${n.kebabPlural}", icon: ... }
  6. bun run typecheck && bun test
`);
