import { prisma } from "@/lib/prisma";
import { intlLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { getTranslations } from "@/i18n/server";
import { translateWith } from "@/i18n/translate";
import { getDealerContext } from "@/lottery/dealer";
import { getCustomerSummary, getDrawBills, getDrawStakes, getLimitRules, getWinningBets } from "@/lottery/queries";
import { winningKeys } from "@/lottery/report";
import { dateToIso, isoToDate } from "@/lottery/date";
import { exportFileName, sheetToPdf, sheetToXlsx, tableToPdf, tableToXlsx } from "@/lottery/table-export";
import { buildReportTable, buildSettlementSheet } from "../export-tables";
import { findReportGroup, reportGroupWhere } from "../groups";
import {
  DEFAULT_PERCENTS,
  isReportView,
  reportGroupName,
  toAmount,
  toPercent,
  toTopOption,
  viewKey,
  type ReportView,
} from "../types";

/** งวดสูงสุดในใบสรุปหนึ่งวัน (หวย 9 ประเภท เผื่อเปิดซ้ำ) */
const SHEET_DRAWS_MAX = 50;
/** บิลสูงสุดในตารางล่างของใบสรุปหนึ่งวัน */
const SHEET_BILLS_MAX = 5000;

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
 * แบบใบสรุปส่งแม่: &layout=sheet&date=YYYY-MM-DD&pl=15&pr=30&owLak=&owThb= (ไม่สนมุมมอง)
 *   ใบเดียวรวมทุกงวดของวันนั้น — หวยเวียดนามหลายรอบ + ลาว + ไทย · ไม่ระบุวันที่ = วันของงวดที่เลือก
 * งวดเลือกแบบเดียวกับหน้ารายงาน (ไม่ระบุ = งวดที่เปิดรับล่าสุด ไม่มี = งวดล่าสุด)
 * &group=<id|none> = เฉพาะโพยของกลุ่มนั้น (ทั้งแบบเดิมและใบสรุป) · ไม่ระบุ = ทุกกลุ่ม · มุมมองเกินอั้นนับทั้งงวดเสมอ
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

  const select = {
    id: true,
    name: true,
    status: true,
    lottery: true,
    drawDate: true,
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

  // เพดานอั้นคิดกับยอดทั้งงวด — มุมมองเกินอั้นไม่กรองกลุ่ม
  const group = !sheet && view === "limits" ? null : await findReportGroup(current.id, url.searchParams.get("group"));
  const ticket = reportGroupWhere(group);

  // ดึงเฉพาะข้อมูลที่มุมมองนี้ใช้
  const keys = winningKeys(draw);
  const byStake = !sheet && (view === "two" || view === "three" || view === "limits");
  const [stakes, limits, customers, winners, bills] = await Promise.all([
    byStake ? getDrawStakes(draw.id, ticket) : [],
    // ยอดของกลุ่มเดียวเทียบกับเพดานของทั้งงวดไม่ได้ — ดูกลุ่มอยู่ไม่ระบายสีเกินอั้น
    byStake && !group ? getLimitRules(current.id) : [],
    view === "customers" && !sheet ? getCustomerSummary(draw.id, keys, ticket) : [],
    view === "winners" && !sheet && keys ? getWinningBets(draw.id, keys, ticket) : [],
    view === "bills" && !sheet ? getDrawBills(draw.id, ticket) : [],
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

  const groupName = group ? reportGroupName(group, t) : null;
  const exportedAt = new Date();
  const pageLabel = (page: number, pages: number) => t("reports.exportPage", { page, pages });
  let file: Buffer;
  let fileView: string;
  let fileName = draw.name;
  if (sheet) {
    const dateParam = url.searchParams.get("date") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dateToIso(draw.drawDate);
    // ทุกงวดของแม่หวยในวันนั้น (หวยเวียดนามวันละหลายรอบ + ลาว + ไทย)
    const dayDraws = await prisma.draw.findMany({
      where: { dealerId: current.id, drawDate: isoToDate(date) },
      orderBy: [{ lottery: "asc" }, { createdAt: "asc" }],
      take: SHEET_DRAWS_MAX,
      select,
    });
    const draws = await Promise.all(
      dayDraws.map(async (item) => ({
        name: item.name,
        lottery: item.lottery,
        keys: winningKeys(item),
        rates: { rate2Top: Number(item.rate2Top), rate2Bottom: Number(item.rate2Bottom), rate3Top: Number(item.rate3Top) },
        stakes: await getDrawStakes(item.id, ticket),
      })),
    );
    // ยอดของแต่ละบิลที่นับยอดแล้ว ของทุกงวดในวันนั้น เรียงตามเวลา (ตารางล่างของใบ)
    const bills = await prisma.ticket.findMany({
      where: { ...ticket, drawId: { in: dayDraws.map((item) => item.id) }, status: "CONFIRMED" },
      orderBy: [{ createdAt: "asc" }, { billNo: "asc" }],
      take: SHEET_BILLS_MAX,
      select: { totalLak: true, totalThb: true },
    });
    const content = buildSettlementSheet({
      t,
      intl,
      date,
      draws,
      group: groupName,
      exportedAt,
      percents: {
        left: toPercent(url.searchParams.get("pl"), DEFAULT_PERCENTS.left),
        right: toPercent(url.searchParams.get("pr"), DEFAULT_PERCENTS.right),
      },
      outstanding: { lak: toAmount(url.searchParams.get("owLak")), thb: toAmount(url.searchParams.get("owThb")) },
      bills: bills.map((bill) => ({ lak: Number(bill.totalLak), thb: Number(bill.totalThb) })),
    });
    const options = { intl, exportedAt, sheetName: t("reports.sheetTitle"), pageLabel };
    file = format === "xlsx" ? await sheetToXlsx(content, options) : await sheetToPdf(content, options);
    fileView = "settlement";
    fileName = date;
  } else {
    const table = buildReportTable({ t, intl, view, top, draw, group: groupName, keys, exportedAt, stakes, limits, customers, winners, bills });
    const options = { intl, exportedAt, sheetName: t(viewKey[view]), pageLabel };
    file = format === "xlsx" ? await tableToXlsx(table, options) : await tableToPdf(table, options);
    fileView = FILE_VIEW[view];
  }
  const name = exportFileName(["report", fileName, ...(groupName ? [groupName] : []), fileView], exportedAt, format);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPE[format],
      // ชื่องวดอาจเป็นภาษาไทย/ลาว — filename* (UTF-8) สำหรับเบราว์เซอร์ใหม่ · filename ธรรมดาสำรองเป็น ASCII
      "Content-Disposition": `attachment; filename="report-${fileView}.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
