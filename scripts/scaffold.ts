/**
 * แม่แบบ module (scaffold) — ไฟล์นี้เป็นของ template
 *
 * scaffold/module/*.tpl คือสำเนาของ module products (module ต้นแบบ) ที่ไม่ถูก compile/test
 * จึงยังสร้าง module ใหม่ได้แม้ project จะลบ products ทิ้งไปแล้ว
 *   - bun run new:module <ชื่อ>   → สร้าง module ใหม่จาก scaffold
 *   - bun run scaffold:sync       → คัดลอก products ปัจจุบันไปเป็น scaffold (ใช้ตอนแก้ต้นแบบใน template)
 * เทสต์ tests/conventions/scaffold.test.ts ฟ้องถ้า scaffold กับ products ไม่ตรงกัน
 */
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");
export const SCAFFOLD_DIR = join(ROOT, "scaffold", "module");

export type ModuleNames = {
  kebabPlural: string; // purchase-orders  → โฟลเดอร์, route
  kebabSingular: string; // purchase-order → ชื่อไฟล์
  camelPlural: string; // purchaseOrders   → namespace i18n
  camelSingular: string; // purchaseOrder  → prisma delegate, ตัวแปร
  pascalPlural: string; // PurchaseOrders  → ชื่อ component
  pascalSingular: string; // PurchaseOrder → ชื่อ model / type
  upperPlural: string; // PURCHASE_ORDERS
  upperSingular: string; // PURCHASE_ORDER → ค่าคงที่
};

const MODULE_FILES = ["page.tsx", "loading.tsx", "types.ts", "actions.ts", "_components/columns.tsx"];

/** ไฟล์ของ module ต้นแบบ -> ที่เก็บใน scaffold -> ที่วางใน module ใหม่ */
export const SCAFFOLD_FILES: Array<{
  source: string;
  scaffold: string;
  target: (n: ModuleNames) => string;
}> = [
  ...MODULE_FILES.map((file) => ({
    source: `src/app/(dashboard)/products/${file}`,
    scaffold: `app/${file}.tpl`,
    target: (n: ModuleNames) => `src/app/(dashboard)/${n.kebabPlural}/${file}`,
  })),
  {
    source: "src/app/(dashboard)/products/_components/products-view.tsx",
    scaffold: "app/_components/products-view.tsx.tpl",
    target: (n) => `src/app/(dashboard)/${n.kebabPlural}/_components/${n.kebabPlural}-view.tsx`,
  },
  {
    source: "src/app/(dashboard)/products/_components/product-dialog.tsx",
    scaffold: "app/_components/product-dialog.tsx.tpl",
    target: (n) => `src/app/(dashboard)/${n.kebabPlural}/_components/${n.kebabSingular}-dialog.tsx`,
  },
  {
    source: "src/lib/validations/product.ts",
    scaffold: "validation.ts.tpl",
    target: (n) => `src/lib/validations/${n.kebabSingular}.ts`,
  },
  {
    source: "src/i18n/modules/products.ts",
    scaffold: "messages.ts.tpl",
    target: (n) => `src/i18n/modules/${n.kebabPlural}.ts`,
  },
  {
    source: "tests/server/product-actions.test.ts",
    scaffold: "actions.test.ts.tpl",
    target: (n) => `tests/server/${n.kebabSingular}-actions.test.ts`,
  },
];

export function isKebab(value: string) {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value);
}

/** categories → category, boxes → box, orders → order */
export function singularize(word: string) {
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, "");
  return word;
}

export function toNames(kebabPlural: string, kebabSingular = singularize(kebabPlural)): ModuleNames {
  const pascal = (s: string) =>
    s
      .split("-")
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join("");
  const camel = (s: string) => pascal(s)[0]!.toLowerCase() + pascal(s).slice(1);
  const upper = (s: string) => s.replaceAll("-", "_").toUpperCase();
  return {
    kebabPlural,
    kebabSingular,
    camelPlural: camel(kebabPlural),
    camelSingular: camel(kebabSingular),
    pascalPlural: pascal(kebabPlural),
    pascalSingular: pascal(kebabSingular),
    upperPlural: upper(kebabPlural),
    upperSingular: upper(kebabSingular),
  };
}

/** เปลี่ยนทุกรูปของคำว่า product ในไฟล์ต้นแบบเป็นชื่อ module ใหม่ (ลำดับสำคัญ: เจาะจง → ทั่วไป) */
export function renameModule(text: string, n: ModuleNames) {
  return text
    .replace(/(?<=\/)products\b|\bproducts(?=-)/g, n.kebabPlural)
    .replace(/(?<=\/)product\b|\bproduct(?=-)/g, n.kebabSingular)
    .replace(/PRODUCTS/g, n.upperPlural)
    .replace(/PRODUCT/g, n.upperSingular)
    .replace(/Products/g, n.pascalPlural)
    .replace(/Product/g, n.pascalSingular)
    .replace(/products/g, n.camelPlural)
    .replace(/product/g, n.camelSingular);
}
