import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { TicketPreview } from "@/app/(dashboard)/tickets/_components/ticket-preview";
import { defaultLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { translateWith } from "@/i18n/translate";
import { parseTicket } from "@/lottery/parser";

afterEach(cleanup);

// ไม่มี I18nProvider → useI18n() ใช้ภาษา default เทียบข้อความจาก dictionary เดียวกัน
const tr = (key: string, params?: Record<string, number>) =>
  translateWith(dictionaries[defaultLocale], key, params);

describe("<TicketPreview /> (ผลการแยกข้อความก่อนบันทึกโพย)", () => {
  test("แสดงจำนวนรายการและเลขที่อ่านได้", () => {
    render(<TicketPreview parsed={parseTicket("32.72=300\n243=150")} />);

    expect(screen.getByText(tr("tickets.previewBets", { count: 3 }))).toBeDefined();
    for (const number of ["32", "72", "243"]) expect(screen.getByText(number)).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("บรรทัดที่อ่านไม่ออกขึ้นเตือนพร้อมเลขบรรทัดและเหตุผล", () => {
    render(<TicketPreview parsed={parseTicket("32=300\n399")} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(tr("tickets.issuesTitle", { count: 1 }));
    expect(alert.textContent).toContain(tr("tickets.issueLine", { line: 2 }));
    expect(alert.textContent).toContain("399");
    expect(alert.textContent).toContain(tr("tickets.issueNO_AMOUNT"));
  });

  test("ยอดรวมที่ลูกค้าแจ้งไม่ตรง → บอกทั้งยอดที่แจ้งและยอดที่คิดได้", () => {
    render(<TicketPreview parsed={parseTicket("74=20\n47=20\nລວມ50")} />);

    expect(screen.getByText(tr("tickets.previewDeclared", { declared: 50, typed: 40 }))).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(tr("tickets.issueTOTAL_MISMATCH"));
  });
});
