"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import {
  createProductSchema,
  deleteProductSchema,
  deleteProductsSchema,
  updateProductSchema,
} from "@/lib/validations/product";

/**
 * รูปแบบมาตรฐานของ server action ใน template นี้:
 *   validate (zod) -> ตรวจสิทธิ์ -> เรียก prisma -> revalidate
 * copy ไฟล์นี้ไปทำ module ใหม่ได้เลย
 *
 * ทุกการเขียนข้อมูล + `logAudit`/`logAuditMany` อยู่ใน `prisma.$transaction()` เดียวกันเสมอ
 * (ดู AGENTS.md ข้อ 2.4) เพื่อให้ audit log กับข้อมูลจริง atomic กัน
 */

export const createProduct = createAction(
  createProductSchema,
  async (input) => {
    const user = await requireUser();

    const product = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...input, description: input.description || null, createdById: user.id },
      });

      await logAudit(tx, {
        action: "CREATE",
        entity: "Product",
        entityId: product.id,
        summary: `${product.sku} · ${product.name}`,
        after: product,
        user,
      });

      return product;
    });

    revalidatePath("/products");
    return { id: product.id };
  },
  { successMessage: "products.created" },
);

export const updateProduct = createAction(
  updateProductSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();

    const product = await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });

      const product = await tx.product.update({
        where: { id },
        data: { ...input, description: input.description || null },
      });

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Product",
        entityId: product.id,
        summary: `${product.sku} · ${product.name}`,
        before,
        after: product,
        user,
      });

      return product;
    });

    revalidatePath("/products");
    return { id: product.id };
  },
  { successMessage: "products.updated" },
);

export const deleteProduct = createAction(
  deleteProductSchema,
  async ({ id }) => {
    const user = await requireUser();

    await prisma.$transaction(async (tx) => {
      const before = await tx.product.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Product",
        entityId: before.id,
        summary: `${before.sku} · ${before.name}`,
        before,
        user,
      });
    });

    revalidatePath("/products");
    return { id };
  },
  { successMessage: "products.deleted" },
);

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อสินค้าหนึ่งชิ้น (createMany) */
export const deleteProducts = createAction(
  deleteProductsSchema,
  async ({ ids }) => {
    const user = await requireUser();

    const count = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: ids } } });
      if (products.length === 0) return 0;

      await tx.product.deleteMany({ where: { id: { in: ids } } });

      await logAuditMany(
        tx,
        products.map((product) => ({
          action: "DELETE" as const,
          entity: "Product",
          entityId: product.id,
          summary: `${product.sku} · ${product.name}`,
          before: product,
          user,
        })),
      );

      return products.length;
    });

    revalidatePath("/products");
    return { count };
  },
  { successMessage: "products.deletedMany" },
);
