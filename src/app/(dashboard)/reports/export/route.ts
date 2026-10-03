import { prisma } from "@/lib/prisma";
import { intlLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getTranslations } from "@/i18n/server";
import { translateWith } from "@/i18n/translate";
import { getDealerContext } from "@/lottery/dealer";
import { getCustomerSummary, getDrawStakes, getLimitRules, getWinningBets } from "@/lottery/queries";
import { winningKeys } from "@/lottery/report";
import { exportFileName, tableToPdf, tableToXlsx } from "@/lottery/table-export";
import { buildReportTable } from "../export-tables";
import { isReportView, toTopOption, viewKey, type ReportView } from "../types";

const CONTENT_TYPE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/** ชื่อมุมมองในชื่อไฟล์ (ASCII ล้วน ใช้ได้ทุกระบบ) */
const FILE_VIEW: Record<ReportView, string> = {
  two: "2-digit",
  three: "3-digit",
  customers: "customers",
  limits: "over-limit",
  winners: "winners",
};

/**
 * ส่งออกรายงานของมุมมองที่เปิดอยู่เป็น Excel / PDF — /reports/export?format=xlsx|pdf&draw=&view=&top=
 * งวดเลือกแบบเดียวกับหน้ารายงาน (ไม่ระบุ = งวดที่เปิดรับล่าสุด ไม่มี = งวดล่าสุด)
 * เห็นได้เฉพาะงวดของแม่หวยที่เลือกอยู่ (getDealerContext ตรวจสิทธิ์ + cookie แม่หวยให้)
 */
export async function GET(request: Request) {
  const { current } = await getDealerContext();
  if (!current) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response(null, { status: 400 });
  const viewParam = url.searchParams.get("view");
  const view: ReportView = isReportView(viewParam) ? viewParam : "two";
  const top = toTopOption(url.searchParams.get("top") ?? undefined);

  const select = { id: true, name: true, status: true, topResult: true, bottomResult: true } as const;
  const drawId = url.searchParams.get("draw")?.slice(0, 50);
  const draw =
    (drawId ? await prisma.draw.findFirst({ where: { id: drawId, dealerId: current.id }, select }) : null) ??
    (await prisma.draw.findFirst({ where: { dealerId: current.id, status: "OPEN" }, orderBy: { drawDate: "desc" }, select })) ??
    (await prisma.draw.findFirst({ where: { dealerId: current.id }, orderBy: { drawDate: "desc" }, select }));
  if (!draw) return new Response(null, { status: 404 });

  // ดึงเฉพาะข้อมูลที่มุมมองนี้ใช้
  const keys = winningKeys(draw);
  const byStake = view === "two" || view === "three" || view === "limits";
  const [stakes, limits, customers, winners] = await Promise.all([
    byStake ? getDrawStakes(draw.id) : [],
    byStake ? getLimitRules(current.id) : [],
    view === "customers" ? getCustomerSummary(draw.id, keys) : [],
    view === "winners" && keys ? getWinningBets(draw.id, keys) : [],
  ]);

  // PDF ฝังฟอนต์ไทย/ลาวเท่านั้น (ไม่มีฟอนต์จีน) — ผู้ใช้ภาษาจีนได้ PDF ภาษาอังกฤษ · Excel ใช้ฟอนต์ของเครื่องจึงแปลตามภาษาที่เลือก
  const i18n = await getTranslations();
  const { t, intl } =
    format === "pdf" && i18n.locale === "zh"
      ? {
          t: (key: string, values?: Record<string, string | number>) => translateWith(dictionaries.en, key, values),
          intl: intlLocale.en,
        }
      : i18n;

  const exportedAt = new Date();
  const table = buildReportTable({ t, intl, view, top, draw, keys, exportedAt, stakes, limits, customers, winners });
  const options = {
    intl,
    exportedAt,
    sheetName: t(viewKey[view]),
    pageLabel: (page: number, pages: number) => t("reports.exportPage", { page, pages }),
  };
  const file = format === "xlsx" ? await tableToXlsx(table, options) : await tableToPdf(table, options);
  const name = exportFileName(["report", draw.name, FILE_VIEW[view]], exportedAt, format);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPE[format],
      // ชื่องวดอาจเป็นภาษาไทย/ลาว — filename* (UTF-8) สำหรับเบราว์เซอร์ใหม่ · filename ธรรมดาสำรองเป็น ASCII
      "Content-Disposition": `attachment; filename="report-${FILE_VIEW[view]}.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
