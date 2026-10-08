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
import { DEFAULT_LAO_PAYOUT, DEFAULT_PERCENTS, toAmount, toPayout, toPercent } from "../types";

/** จำเปอร์เซ็นต์ล่าสุดไว้ในเครื่องผู้ใช้ — ใช้สะดวกอย่างเดียว ไม่มีก็ใช้ค่าเริ่มต้น */
const STORAGE_KEY = "reports.settlementPercents";
/** จำเงินรางวัลหวยลาวแยกตามแม่หวย (แต่ละเจ้าจ่ายไม่เท่ากัน) */
const payoutStorageKey = (dealerId: string) => `reports.laoPayout.${dealerId}`;

/**
 * ส่งออกแบบ "ใบสรุปส่งแม่" ของทั้งวัน — ตั้งวันที่ เปอร์เซ็นต์ของสองกล่อง และยอดค้าง
 * แล้วดาวน์โหลด Excel / PDF (reports/export/route.ts?layout=sheet) · เลือกกลุ่มอยู่ = ใบนี้คิดเฉพาะโพยของกลุ่มนั้น
 * เงินรางวัลหวยลาวต่อ 1,000 กีบ (2 ตัว / 3 ตัว) ใช้คิดยอดถูกของงวดหวยลาว — จำไว้ต่อแม่หวย
 */
export function SettlementExport({
  dealerId,
  drawId,
  drawDate,
  group,
}: {
  dealerId: string;
  drawId: string;
  drawDate: string;
  /** กลุ่มที่เลือกในหน้ารายงาน (label แปลแล้ว) — null = ทุกกลุ่ม */
  group: { key: string; label: string } | null;
}) {
  const { t } = useI18n();
  const [date, setDate] = React.useState(drawDate);
  const [left, setLeft] = React.useState(String(DEFAULT_PERCENTS.left));
  const [right, setRight] = React.useState(String(DEFAULT_PERCENTS.right));
  const [owLak, setOwLak] = React.useState("");
  const [owThb, setOwThb] = React.useState("");
  const [lao2, setLao2] = React.useState(String(DEFAULT_LAO_PAYOUT.two));
  const [lao3, setLao3] = React.useState(String(DEFAULT_LAO_PAYOUT.three));

  React.useEffect(() => setDate(drawDate), [drawDate]);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as { left?: number; right?: number } | null;
      if (typeof saved?.left === "number") setLeft(String(saved.left));
      if (typeof saved?.right === "number") setRight(String(saved.right));
    } catch {}
  }, []);
  React.useEffect(() => {
    let saved: { two?: number; three?: number } | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(payoutStorageKey(dealerId)) ?? "null");
    } catch {}
    setLao2(String(typeof saved?.two === "number" ? saved.two : DEFAULT_LAO_PAYOUT.two));
    setLao3(String(typeof saved?.three === "number" ? saved.three : DEFAULT_LAO_PAYOUT.three));
  }, [dealerId]);

  const percents = { left: toPercent(left, DEFAULT_PERCENTS.left), right: toPercent(right, DEFAULT_PERCENTS.right) };
  const payout = { two: toPayout(lao2, DEFAULT_LAO_PAYOUT.two), three: toPayout(lao3, DEFAULT_LAO_PAYOUT.three) };
  const href = (format: "xlsx" | "pdf") =>
    `/reports/export?${buildQueryString(
      {},
      {
        format,
        draw: drawId,
        group: group?.key,
        layout: "sheet",
        date,
        pl: percents.left,
        pr: percents.right,
        owLak: toAmount(owLak) || undefined,
        owThb: toAmount(owThb) || undefined,
        lao2: payout.two,
        lao3: payout.three,
      },
    )}`;
  const remember = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(percents));
      window.localStorage.setItem(payoutStorageKey(dealerId), JSON.stringify(payout));
    } catch {}
  };

  const field = (id: string, label: string, value: string, onChange: (value: string) => void, percent = false) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {percent ? " (%)" : ""}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={percent ? 0 : undefined}
        max={percent ? 100 : undefined}
        step="any"
        placeholder={percent ? undefined : "0"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0">
          <ReceiptText /> <span className="truncate">{t("reports.exportSheet")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reports.sheetTitle")}</DialogTitle>
          <DialogDescription>{t("reports.sheetDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {group ? (
            <p className="text-sm">
              {t("reports.group")}: <span className="font-semibold">{group.label}</span>
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="settlement-date">{t("reports.sheetDate")}</Label>
            <Input id="settlement-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <p className="text-muted-foreground text-sm">{t("reports.sheetDateHint")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("settlement-left", t("reports.sheetPercentLeft"), left, setLeft, true)}
            {field("settlement-right", t("reports.sheetPercentRight"), right, setRight, true)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("settlement-ow-lak", `${t("reports.sheetOutstanding")} (${t("lottery.currencyLAK")})`, owLak, setOwLak)}
            {field("settlement-ow-thb", `${t("reports.sheetOutstanding")} (${t("lottery.currencyTHB")})`, owThb, setOwThb)}
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("reports.sheetLaoPayout")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("settlement-lao-2", t("reports.sheetLaoPayout2"), lao2, setLao2)}
              {field("settlement-lao-3", t("reports.sheetLaoPayout3"), lao3, setLao3)}
            </div>
            <p className="text-muted-foreground text-sm">{t("reports.sheetLaoPayoutHint")}</p>
          </fieldset>
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
