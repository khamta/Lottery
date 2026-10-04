import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { dictionaries } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/config";
import { translateWith } from "@/i18n/translate";

// ไม่มี I18nProvider ในเทสต์ → ใช้ t ตัวเดียวคงที่ (แบบเดียวกับ read-rule-dialog.test.tsx)
const t = (key: string, params?: Record<string, string | number>) =>
  translateWith(dictionaries[defaultLocale], key, params);
const i18n = { locale: defaultLocale, intl: "lo-LA", t, setLocale: () => {} };
mock.module("@/i18n/client", () => ({ useI18n: () => i18n }));

const { RereadImageDialog } = await import("@/app/(dashboard)/tickets/_components/reread-image-dialog");

afterEach(cleanup);

function renderDialog(onSubmit = mock((_engine: string) => {})) {
  render(<RereadImageDialog description="บิล 261002143015" onOpenChange={() => {}} onSubmit={onSubmit} />);
  return onSubmit;
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: t("tickets.rereadSubmit") }));

describe("<RereadImageDialog /> (เลือกตัวอ่านก่อนอ่านรูปโพยใหม่)", () => {
  test("ค่าเริ่มต้นเป็นตัวอ่านปกติ (ไม่มีค่าใช้จ่าย) → ส่ง OCR", () => {
    const onSubmit = renderDialog();

    expect(screen.getByText("บิล 261002143015")).toBeTruthy();
    const [ocr] = screen.getAllByRole("radio");
    expect(ocr!.textContent).toContain(t("tickets.engineOCR"));
    expect(ocr!.getAttribute("aria-checked")).toBe("true");
    submit();

    expect(onSubmit).toHaveBeenCalledWith("OCR");
  });

  test("เลือก AI → เห็นคำเตือนค่าใช้จ่าย และส่ง AI ออกไปให้ view ถามยืนยันต่อ", () => {
    const onSubmit = renderDialog();

    expect(screen.getByText(t("tickets.engineAIHint"))).toBeTruthy();
    const [, ai] = screen.getAllByRole("radio");
    expect(ai!.textContent).toContain(t("tickets.engineAI"));
    fireEvent.click(ai!);
    submit();

    expect(onSubmit).toHaveBeenCalledWith("AI");
  });
});
