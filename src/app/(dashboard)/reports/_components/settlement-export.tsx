"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { buildQueryString } from "@/lib/query";
import { DEFAULT_PERCENT, toPercent } from "../types";

/** จำเปอร์เซ็นต์ล่าสุดไว้ในเครื่องผู้ใช้ — ใช้สะดวกอย่างเดียว ไม่มีก็ใช้ค่าเริ่มต้น */
const STORAGE_KEY = "reports.settlementPercent";

/**
 * ส่งออกแบบ "ใบสรุปส่งแม่" — ตั้งเปอร์เซ็นต์ที่หักแล้วดาวน์โหลด Excel / PDF (reports/export/route.ts?layout=sheet)
 */
export function SettlementExport({ drawId }: { drawId: string }) {
  const { t } = useI18n();
  const [percent, setPercent] = React.useState(String(DEFAULT_PERCENT));

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPercent(saved);
    } catch {}
  }, []);

  const value = toPercent(percent);
  const href = (format: "xlsx" | "pdf") =>
    `/reports/export?${buildQueryString({}, { format, draw: drawId, layout: "sheet", percent: value })}`;
  const remember = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ReceiptText /> {t("reports.exportSheet")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reports.sheetTitle")}</DialogTitle>
          <DialogDescription>{t("reports.sheetDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="settlement-percent">{t("reports.sheetPercent")} (%)</Label>
          <Input
            id="settlement-percent"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href={href("xlsx")} download onClick={remember}>
              <FileSpreadsheet /> {t("reports.exportExcel")}
            </a>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <a href={href("pdf")} download onClick={remember}>
              <FileText /> {t("reports.exportPdf")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
