import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { dictionaries } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/config";
import { translateWith } from "@/i18n/translate";
import type { TicketRow } from "@/app/(dashboard)/tickets/types";

// ไม่มี I18nProvider ในเทสต์ → ใช้ t ตัวเดียวคงที่ (แบบเดียวกับ reread-image-dialog.test.tsx)
const t = (key: string, params?: Record<string, string | number>) =>
  translateWith(dictionaries[defaultLocale], key, params);
const i18n = { locale: defaultLocale, intl: "lo-LA", t, setLocale: () => {} };
mock.module("@/i18n/client", () => ({ useI18n: () => i18n }));

const { ImageEditorDialog } = await import("@/app/(dashboard)/tickets/_components/image-editor-dialog");

afterEach(cleanup);

const ticket = (overrides: Partial<TicketRow> = {}): TicketRow => ({
  id: "t1",
  billNo: "261002143015",
  drawId: "draw-1",
  drawName: "งวด 1",
  customerId: null,
  customerName: null,
  senderName: "Noy",
  source: "WHATSAPP",
  status: "REVIEW",
  rawText: "",
  lakMultiplier: 1000,
  note: null,
  issueCount: 1,
  ocrStatus: "DONE",
  ocrReader: null,
  ocrTranscript: null,
  imageEditedAt: null,
  groupId: null,
  isNew: false,
  betCount: 0,
  totalLak: 0,
  totalThb: 0,
  createdAt: "2026-10-02T07:30:15.000Z",
  ...overrides,
});

describe("<ImageEditorDialog /> (แก้รูปโพยก่อนอ่านใหม่)", () => {
  test("เปิดด้วยเครื่องมือครอป · ยังไม่ได้แก้อะไร = กดบันทึกไม่ได้", () => {
    render(<ImageEditorDialog ticket={ticket()} onOpenChange={() => {}} onSubmit={() => {}} />);

    expect(screen.getByText(t("tickets.editImageTitle"))).toBeTruthy();
    expect(screen.getByRole("radio", { name: t("tickets.toolCrop") }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(t("tickets.cropHint"))).toBeTruthy();
    const save = screen.getByRole("button", { name: t("tickets.editImageSave") }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  test("เลือกยางลบ → มีตัวปรับขนาดยางลบ", () => {
    render(<ImageEditorDialog ticket={ticket()} onOpenChange={() => {}} onSubmit={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: t("tickets.toolErase") }));

    expect(screen.getByText(t("tickets.eraseHint"))).toBeTruthy();
    expect(screen.getByRole("slider", { name: t("tickets.brushSize") })).toBeTruthy();
  });

  test("มีตัวปรับความสว่าง/ความเข้มเสมอ (เริ่มที่ 100%)", () => {
    render(<ImageEditorDialog ticket={ticket()} onOpenChange={() => {}} onSubmit={() => {}} />);

    const brightness = screen.getByRole("slider", { name: t("tickets.brightness") }) as HTMLInputElement;
    const contrast = screen.getByRole("slider", { name: t("tickets.contrast") }) as HTMLInputElement;
    expect(brightness.value).toBe("100");
    expect(contrast.value).toBe("100");
    expect(screen.queryByRole("button", { name: t("tickets.resetAdjust") })).toBeNull();
  });

  test("ปุ่มเริ่มจากรูปต้นฉบับ แสดงเฉพาะรูปที่เคยแก้แล้ว", () => {
    const { rerender } = render(<ImageEditorDialog ticket={ticket()} onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole("button", { name: t("tickets.useOriginal") })).toBeNull();

    rerender(
      <ImageEditorDialog
        ticket={ticket({ imageEditedAt: "2026-10-03T01:00:00.000Z" })}
        onOpenChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: t("tickets.useOriginal") })).toBeTruthy();
  });

  test("ticket = null → ไม่เปิด", () => {
    render(<ImageEditorDialog ticket={null} onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByText(t("tickets.editImageTitle"))).toBeNull();
  });
});
