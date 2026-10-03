import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTranslations } from "@/i18n/server";
import { buildQueryString } from "@/lib/query";
import type { ReportView, TopOption } from "../types";
import { SettlementExport } from "./settlement-export";

/**
 * ปุ่มส่งออก Excel / PDF ของมุมมองที่เปิดอยู่ (แบบเดิม) + ปุ่มใบสรุปส่งแม่ (settlement-export.tsx)
 * — ลิงก์ดาวน์โหลดไป reports/export/route.ts
 * ส่งงวด / มุมมอง / จำนวนอันดับที่ server เลือกแล้วไปเสมอ ไฟล์จึงตรงกับที่เห็นบนจอแม้ URL ไม่ได้ระบุ
 */
export async function ReportExport({
  drawId,
  drawDate,
  view,
  top,
}: {
  drawId: string;
  /** YYYY-MM-DD — วันตั้งต้นของใบสรุปส่งแม่ */
  drawDate: string;
  view: ReportView;
  top: TopOption;
}) {
  const { t } = await getTranslations();
  const href = (format: "xlsx" | "pdf") => `/reports/export?${buildQueryString({}, { format, draw: drawId, view, top })}`;

  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download /> {t("reports.export")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("reports.exportOriginal")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={href("xlsx")} download>
              <FileSpreadsheet /> {t("reports.exportExcel")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={href("pdf")} download>
              <FileText /> {t("reports.exportPdf")}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettlementExport drawId={drawId} drawDate={drawDate} />
    </div>
  );
}
