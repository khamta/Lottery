import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import type { PageProps } from "@/types";
import { ProductsView } from "./_components/products-view";
import { PRODUCT_SORTABLE, type ProductRow } from "./types";

export const metadata: Metadata = { title: "Products" };

/**
 * แม่แบบ "หน้ารายการ" ของทุก module:
 *   searchParams -> parseListParams -> where/orderBy -> paginate -> ส่งให้ client component
 * ฐานข้อมูลส่งกลับเฉพาะแถวของหน้าที่เลือก (skip/take) ไม่ใช่ทั้งตาราง
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const params = parseListParams(await searchParams, {
    sortable: PRODUCT_SORTABLE,
    defaultSort: "updatedAt",
    defaultOrder: "desc",
  });

  // mode: "insensitive" ใช้ได้กับ PostgreSQL/MongoDB — ถ้าย้ายไป SQL Server/MySQL ให้ตัดออก
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { sku: { contains: params.q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const page = await paginate<
    ProductRow,
    {
      id: string;
      name: string;
      sku: string;
      description: string | null;
      price: unknown;
      stock: number;
      status: ProductRow["status"];
      updatedAt: Date;
    }
  >(prisma.product, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      sku: true,
      description: true,
      price: true,
      stock: true,
      status: true,
      updatedAt: true,
    },
    map: (row) => ({ ...row, price: Number(row.price), updatedAt: row.updatedAt.toISOString() }),
  });

  return (
    <>
      <PageHeader title={t("products.title")} description={t("products.subtitle")} />
      <ProductsView page={page} />
    </>
  );
}
