import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { ownerScope } from "@/lottery/access";
import { AI_MODEL, AI_STRONG_MODEL, OLLAMA_FALLBACK_MODELS, ocrModelField, ocrStrongModelField } from "@/lottery/ai-models";
import { getDealerContext } from "@/lottery/dealer";
import { listOllamaVisionModels } from "@/lottery/ollama";
import type { PageProps } from "@/types";
import { DealersView } from "./_components/dealers-view";
import { DEALER_SORTABLE, type DealerRow } from "./types";

export const metadata: Metadata = { title: "Dealers" };

/** แม่หวยของบัญชีนี้เท่านั้น — บัญชีอื่นมองไม่เห็นและแก้ไม่ได้ (ผู้ดูแลระบบเห็นของทุกบัญชี พร้อมชื่อเจ้าของ) */
export default async function DealersPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { user, access, current } = await getDealerContext();
  const params = parseListParams(await searchParams, {
    sortable: DEALER_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "asc",
  });

  const where = {
    ...ownerScope(access),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { note: { contains: params.q, mode: "insensitive" as const } },
            ...(access.isAdmin
              ? [
                  { owner: { name: { contains: params.q, mode: "insensitive" as const } } },
                  { owner: { email: { contains: params.q, mode: "insensitive" as const } } },
                ]
              : []),
          ],
        }
      : {}),
  };

  const page = await paginate<
    DealerRow,
    {
      id: string;
      name: string;
      note: string | null;
      ocrModel: string | null;
      ocrStrongModel: string | null;
      readImages: boolean;
      ownerId: string;
      owner: { name: string | null; email: string };
      updatedAt: Date;
      _count: { draws: number; customers: number; groups: number };
    }
  >(prisma.dealer, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      note: true,
      ocrModel: true,
      ocrStrongModel: true,
      readImages: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      updatedAt: true,
      _count: { select: { draws: true, customers: true, groups: true } },
    },
    map: ({ _count, ownerId, owner, ...row }) => ({
      ...row,
      ocrModel: ocrModelField(row.ocrModel),
      ocrStrongModel: ocrStrongModelField(row.ocrStrongModel),
      ownerName: ownerId === user.id ? null : (owner.name ?? owner.email),
      drawCount: _count.draws,
      customerCount: _count.customers,
      groupCount: _count.groups,
      updatedAt: row.updatedAt.toISOString(),
    }),
  });

  // รุ่นของ Ollama Cloud ที่อ่านรูปได้ (ดึงสด เก็บไว้ 1 ชั่วโมง · ดึงไม่ได้ = รายการที่รู้จัก)
  const ollamaHost = process.env.OLLAMA_HOST || undefined;
  const ollamaModels = await listOllamaVisionModels(OLLAMA_FALLBACK_MODELS, { host: ollamaHost });
  // ไม่ลองเรียกทุกรุ่นเพื่อดูสิทธิ์ (ollamaModelAccess) แล้ว — Ollama คิดเงินทุกคำขอตั้งแต่ 31/08/2026
  // เปิดหน้านี้ทีไรเสียเงินค่ารุ่นที่ไม่ได้ใช้ ~20 รุ่น · รุ่นที่ใช้ไม่ได้จริงจะแจ้ง error ตอนอ่านรูปอยู่แล้ว
  const ollamaAccess = {};

  return (
    <>
      <PageHeader title={t("dealers.title")} description={t("dealers.subtitle")} />
      <DealersView
        page={page}
        currentId={current?.id ?? null}
        showOwner={access.isAdmin}
        ocrDefaults={{ model: AI_MODEL, strongModel: AI_STRONG_MODEL }}
        ollamaModels={ollamaModels}
        ollamaAccess={ollamaAccess}
      />
    </>
  );
}
