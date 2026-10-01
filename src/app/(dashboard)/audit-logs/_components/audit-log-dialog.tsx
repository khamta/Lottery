"use client";

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n/client";
import { formatDate } from "@/lib/utils";
import { actionKey, entityKey, type AuditJsonValue, type AuditLogRow } from "../types";
import { actionVariant, actorLabel } from "./columns";

/** หนึ่งแถวของตารางการเปลี่ยนแปลง — hasFrom/hasTo แยก "ไม่มีค่า" ออกจาก "ค่าเป็น null" */
export type ChangeRow = {
  field: string;
  from: AuditJsonValue;
  to: AuditJsonValue;
  hasFrom: boolean;
  hasTo: boolean;
};

function isRecord(value: unknown): value is Record<string, AuditJsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * แปลง changes (Json) เป็นแถว field / ก่อน → หลัง
 *   CREATE: {field: {to}} · UPDATE: {field: {from, to}} · DELETE: {field: {from}}
 * ค่าที่ไม่ใช่รูปแบบ {from,to} (ข้อมูลเก่า/ผิดรูป) ถือเป็นค่า "หลัง" ทั้งก้อน
 */
export function toChangeRows(changes: AuditJsonValue): ChangeRow[] {
  if (!isRecord(changes)) return [];

  return Object.entries(changes).map(([field, value]) => {
    if (isRecord(value) && ("from" in value || "to" in value)) {
      return {
        field,
        from: value.from ?? null,
        to: value.to ?? null,
        hasFrom: "from" in value,
        hasTo: "to" in value,
      };
    }
    return { field, from: null, to: value, hasFrom: false, hasTo: true };
  });
}

function ChangeValue({ value, present }: { value: AuditJsonValue; present: boolean }) {
  const { t } = useI18n();

  if (!present) return <span className="text-muted-foreground">—</span>;
  if (value === null || value === "") {
    return <span className="text-muted-foreground italic">{t("auditLogs.emptyValue")}</span>;
  }

  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="font-mono text-xs break-all whitespace-pre-wrap">{text}</span>;
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-all">{value || t("auditLogs.unknown")}</dd>
    </div>
  );
}

/** หน้าต่างอ่านอย่างเดียว: รายละเอียดเหตุการณ์ + ตารางการเปลี่ยนแปลง */
export function AuditLogDialog({
  log,
  onOpenChange,
}: {
  log: AuditLogRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, intl } = useI18n();
  const rows = log ? toChangeRows(log.changes) : [];

  return (
    <Dialog open={!!log} onOpenChange={onOpenChange}>
      <DialogContent className="scroll-area max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        {log ? (
          <>
            <DialogHeader className="pr-6">
              <DialogTitle className="flex flex-wrap items-center gap-2 leading-snug">
                <Badge variant={actionVariant[log.action]}>{t(actionKey[log.action])}</Badge>
                <span>{entityKey[log.entity] ? t(entityKey[log.entity]) : log.entity}</span>
              </DialogTitle>
              <DialogDescription>{log.summary || log.entityId || t("auditLogs.detailTitle")}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <MetaItem label={t("auditLogs.time")} value={formatDate(log.createdAt, intl)} />
              <MetaItem label={t("auditLogs.actor")} value={actorLabel(log, t)} />
              <MetaItem label={t("auditLogs.entityId")} value={log.entityId} />
              <MetaItem label={t("auditLogs.ip")} value={log.ip} />
              <div className="sm:col-span-2">
                <MetaItem label={t("auditLogs.userAgent")} value={log.userAgent} />
              </div>
            </dl>

            <section className="space-y-2" aria-label={t("auditLogs.changes")}>
              <h3 className="text-sm font-medium">{t("auditLogs.changes")}</h3>
              {rows.length ? (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t("auditLogs.field")}</TableHead>
                        <TableHead>{t("auditLogs.before")}</TableHead>
                        <TableHead className="w-6 px-0" aria-hidden />
                        <TableHead>{t("auditLogs.after")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.field} className="[&>td]:align-top">
                          <TableCell className="font-medium whitespace-nowrap">{row.field}</TableCell>
                          <TableCell className="min-w-24 whitespace-normal">
                            <ChangeValue value={row.from} present={row.hasFrom} />
                          </TableCell>
                          <TableCell className="w-6 px-0 text-muted-foreground" aria-hidden>
                            <ArrowRight className="size-3.5" />
                          </TableCell>
                          <TableCell className="min-w-24 whitespace-normal">
                            <ChangeValue value={row.to} present={row.hasTo} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("auditLogs.noChanges")}
                </p>
              )}
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
