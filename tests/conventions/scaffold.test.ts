import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ROOT,
  SCAFFOLD_DIR,
  SCAFFOLD_FILES,
  renameModule,
  singularize,
  toNames,
} from "../../scripts/scaffold";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("scaffold ของ bun run new:module", () => {
  test("มีไฟล์แม่แบบครบ", () => {
    const missing = SCAFFOLD_FILES.filter((f) => !existsSync(join(SCAFFOLD_DIR, f.scaffold))).map(
      (f) => f.scaffold,
    );
    expect(missing).toEqual([]);
  });

  // project ที่ลบ products ทิ้งแล้วจะข้ามเทสต์นี้ไปเอง
  const hasProducts = existsSync(join(ROOT, "src/app/(dashboard)/products/page.tsx"));
  test.skipIf(!hasProducts)("ตรงกับ module products (ถ้าไม่ตรง: bun run scaffold:sync)", () => {
    const drifted = SCAFFOLD_FILES.filter(
      (f) => read(join(ROOT, f.source)) !== read(join(SCAFFOLD_DIR, f.scaffold)),
    ).map((f) => f.source);
    expect(drifted).toEqual([]);
  });
});

describe("การตั้งชื่อ module", () => {
  test("แปลงชื่อทุกรูปแบบ", () => {
    expect(toNames("purchase-orders")).toEqual({
      kebabPlural: "purchase-orders",
      kebabSingular: "purchase-order",
      camelPlural: "purchaseOrders",
      camelSingular: "purchaseOrder",
      pascalPlural: "PurchaseOrders",
      pascalSingular: "PurchaseOrder",
      upperPlural: "PURCHASE_ORDERS",
      upperSingular: "PURCHASE_ORDER",
    });
    expect(toNames("people", "person").pascalSingular).toBe("Person");
  });

  test("ทำเป็นเอกพจน์", () => {
    expect(singularize("orders")).toBe("order");
    expect(singularize("categories")).toBe("category");
    expect(singularize("boxes")).toBe("box");
    expect(singularize("address")).toBe("address");
  });

  test("เปลี่ยนชื่อในโค้ดตามบริบท (path / component / ค่าคงที่ / i18n / prisma)", () => {
    const n = toNames("purchase-orders");
    const source = [
      'import { ProductsView } from "./_components/products-view";',
      'import { productSchema } from "@/lib/validations/product";',
      'revalidatePath("/products");',
      "PRODUCT_SORTABLE",
      't("products.title")',
      "prisma.product.findMany",
      "<ProductDialog />",
    ].join("\n");
    expect(renameModule(source, n)).toBe(
      [
        'import { PurchaseOrdersView } from "./_components/purchase-orders-view";',
        'import { purchaseOrderSchema } from "@/lib/validations/purchase-order";',
        'revalidatePath("/purchase-orders");',
        "PURCHASE_ORDER_SORTABLE",
        't("purchaseOrders.title")',
        "prisma.purchaseOrder.findMany",
        "<PurchaseOrderDialog />",
      ].join("\n"),
    );
  });
});
