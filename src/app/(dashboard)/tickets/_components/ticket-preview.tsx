"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/client";
import { currencyKey, positionKey } from "@/lottery/labels";
import type { ParsedTicket } from "@/lottery/parser";
import { summarizeTicket } from "@/lottery/ticket";
import { formatNumber } from "@/lottery/format";
import { isOddLak } from "@/lottery/odd-lak";
import { issueKey } from "../types";

/** ผลการแยกข้อความแบบสด ๆ ระหว่างพิมพ์ — ให้คนคีย์เห็นว่าระบบอ่านได้อะไรก่อนกดบันทึก */
export function TicketPreview({ parsed }: { parsed: ParsedTicket }) {
  const { t, intl } = useI18n();
  // ยอดที่จะนับ ถ้าบันทึกแบบนับเฉพาะบรรทัดที่อ่านได้
  const totals = summarizeTicket(parsed, true);
  // ยอดกีบไม่ลงท้าย 000 — อ่านผ่านแต่น่าจะอ่าน/พิมพ์ผิด ให้คนตรวจเห็นก่อนบันทึก
  const oddLak = (bet: ParsedTicket["bets"][number]) => bet.currency === "LAK" && isOddLak(bet.amount);
  const oddCount = parsed.bets.filter(oddLak).length;

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">{t("tickets.previewBets", { count: parsed.bets.length })}</span>
        <span className="tabular-nums">
          {t(currencyKey.LAK)} {formatNumber(totals.totalLak, intl)}
        </span>
        <span className="tabular-nums">
          {t(currencyKey.THB)} {formatNumber(totals.totalThb, intl)}
        </span>
        {parsed.declaredTotal !== null ? (
          <span className="text-muted-foreground tabular-nums">
            {t("tickets.previewDeclared", { declared: parsed.declaredTotal, typed: parsed.typedTotal })}
          </span>
        ) : null}
      </div>

      {parsed.issues.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{t("tickets.issuesTitle", { count: parsed.issues.length })}</AlertTitle>
          <AlertDescription>
            <ul className="grid gap-0.5">
              {parsed.issues.map((issue, index) => (
                <li key={index}>
                  {issue.line > 0 ? `${t("tickets.issueLine", { line: issue.line })}: ` : ""}
                  <span className="font-medium text-foreground tabular-nums">{issue.text}</span>
                  {" — "}
                  {t(issueKey[issue.code])}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {oddCount > 0 ? (
        <p className="flex items-start gap-1.5 text-sm font-medium">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          {t("tickets.oddLakWarning", { count: oddCount })}
        </p>
      ) : null}

      {parsed.bets.length > 0 ? (
        <ul className="scroll-area grid max-h-40 grid-cols-1 gap-x-4 gap-y-0.5 overflow-y-auto text-sm tabular-nums sm:grid-cols-2">
          {parsed.bets.map((bet, index) => (
            <li
              key={index}
              className={`flex justify-between gap-2 ${oddLak(bet) ? "rounded-sm bg-warning/15 px-1 font-semibold" : ""}`}
            >
              <span>
                <span className="font-semibold">{bet.number}</span> {t(positionKey[bet.position])}
              </span>
              <span>
                {formatNumber(bet.amount, intl)} {t(currencyKey[bet.currency])}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
