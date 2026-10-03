import { prisma } from "@/lib/prisma";
import { intlLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getTranslations } from "@/i18n/server";
import { translateWith } from "@/i18n/translate";
import { getDealerContext } from "@/lottery/dealer";
import { getCustomerSummary, getDrawBills, getDrawStakes, getLimitRules, getWinningBets } from "@/lottery/queries";
import { winningKeys } from "@/lottery/report";
import { exportFileName, sheetToPdf, sheetToXlsx, tableToPdf, tableToXlsx } from "@/lottery/table-export";
import { buildReportTable, buildSettlementSheet } from "../export-tables";
import { isReportView, toPercent, toTopOption, viewKey, type ReportView } from "../types";

const CONTENT_TYPE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/** ชื่อมุมมองในชื่อไฟล์ (ASCII ล้วน ใช้ได้ทุกระบบ) */
const FILE_VIEW: Record<ReportView, string> = {
  two: "2-digit",
  three: "3-digit",
  customers: "customers",
  bills: "bills",
  limits: "over-limit",
  winners: "winners",
};

/**
 * ส่งออกรายงานของมุมมองที่เปิดอยู่เป็น Excel / PDF — /reports/export?format=xlsx|pdf&draw=&view=&top=
 * แบบใบสรุปส่งแม่: &layout=sheet&percent=30 (ไม่สนมุมมอง — สรุปทั้งงวด)
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

  const sheet = url.searchParams.get("layout") === "sheet";
  const percent = toPercent(url.searchParams.get("percent"));

  const select = {
    id: true,
    name: true,
    status: true,
    topResult: true,
    bottomResult: true,
    rate2Top: true,
    rate2Bottom: true,
    rate3Top: true,
  } as const;
  const drawId = url.searchParams.get("draw")?.slice(0, 50);
  const draw =
    (drawId ? await prisma.draw.findFirst({ where: { id: drawId, dealerId: current.id }, select }) : null) ??
    (await prisma.draw.findFirst({ where: { dealerId: current.id, status: "OPEN" }, orderBy: { drawDate: "desc" }, select })) ??
    (await prisma.draw.findFirst({ where: { dealerId: current.id }, orderBy: { drawDate: "desc" }, select }));
  if (!draw) return new Response(null, { status: 404 });

  // ดึงเฉพาะข้อมูลที่มุมมองนี้ใช้
  const keys = winningKeys(draw);
  const byStake = sheet || view === "two" || view === "three" || view === "limits";
  const [stakes, limits, customers, winners, bills] = await Promise.all([
    byStake ? getDrawStakes(draw.id) : [],
    byStake && !sheet ? getLimitRules(current.id) : [],
    view === "customers" && !sheet ? getCustomerSummary(draw.id, keys) : [],
    view === "winners" && !sheet && keys ? getWinningBets(draw.id, keys) : [],
    view === "bills" && !sheet ? getDrawBills(draw.id) : [],
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
  const pageLabel = (page: number, pages: number) => t("reports.exportPage", { page, pages });
  let file: Buffer;
  let fileView: string;
  if (sheet) {
    const rates = { rate2Top: Number(draw.rate2Top), rate2Bottom: Number(draw.rate2Bottom), rate3Top: Number(draw.rate3Top) };
    const content = buildSettlementSheet({ t, intl, draw, keys, exportedAt, stakes, rates, percent });
    const options = { intl, exportedAt, sheetName: t("reports.sheetTitle"), pageLabel };
    file = format === "xlsx" ? await sheetToXlsx(content, options) : await sheetToPdf(content, options);
    fileView = "settlement";
  } else {
    const table = buildReportTable({ t, intl, view, top, draw, keys, exportedAt, stakes, limits, customers, winners, bills });
    const options = { intl, exportedAt, sheetName: t(viewKey[view]), pageLabel };
    file = format === "xlsx" ? await tableToXlsx(table, options) : await tableToPdf(table, options);
    fileView = FILE_VIEW[view];
  }
  const name = exportFileName(["report", draw.name, fileView], exportedAt, format);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPE[format],
      // ชื่องวดอาจเป็นภาษาไทย/ลาว — filename* (UTF-8) สำหรับเบราว์เซอร์ใหม่ · filename ธรรมดาสำรองเป็น ASCII
      "Content-Disposition": `attachment; filename="report-${fileView}.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
