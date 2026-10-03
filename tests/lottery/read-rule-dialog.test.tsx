import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { dictionaries } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/config";
import { translateWith } from "@/i18n/translate";

// ไม่มี I18nProvider ในเทสต์ → ใช้ t ตัวเดียวคงที่ (แบบเดียวกับ lottery-dialogs.test.tsx)
const t = (key: string, params?: Record<string, string | number>) =>
  translateWith(dictionaries[defaultLocale], key, params);
const i18n = { locale: defaultLocale, intl: "lo-LA", t, setLocale: () => {} };
mock.module("@/i18n/client", () => ({ useI18n: () => i18n }));

const { ReadRuleDialog } = await import("@/app/(dashboard)/read-rules/_components/read-rule-dialog");

afterEach(cleanup);

const submit = () => fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

function renderDialog(onSubmit = mock((_values: unknown) => {})) {
  render(<ReadRuleDialog open onOpenChange={() => {}} rule={null} activeRules={[]} onSubmit={onSubmit} />);
  return onSubmit;
}

describe("<ReadRuleDialog /> (เพิ่ม / แก้เงื่อนไขอ่านโพย)", () => {
  test("ลองกับข้อความ: เห็นทันทีว่าบรรทัดถูกแปลงเป็นอะไร และระบบอ่านได้กี่รายการ", async () => {
    renderDialog();

    type(t("readRules.findPlaceholderPATTERN"), "ລ {N} x{A}");
    type(t("readRules.replacePlaceholderPATTERN"), "{N}={A}ລ່າງ");
    type(t("readRules.tryPlaceholder"), "ລ 30 70 x100");

    await waitFor(() => expect(screen.getByText("30 70=100ລ່າງ")).toBeTruthy());
    expect(screen.getByText(t("readRules.byThisRule"))).toBeTruthy();
    expect(screen.getByText(t("tickets.previewBets", { count: 2 }))).toBeTruthy();
  });

  test("รูปแบบถูกต้อง → ส่งค่าออกทาง onSubmit", async () => {
    const onSubmit = renderDialog();

    type(t("readRules.findPlaceholderPATTERN"), "ລ {N} x{A}");
    type(t("readRules.replacePlaceholderPATTERN"), "{N}={A}ລ່າງ");
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ kind: "PATTERN", find: "ລ {N} x{A}", replace: "{N}={A}ລ່າງ" });
  });

  test("รูปแบบไม่มีช่อง {N}/{A} → ไม่บันทึก และบอกเหตุผล", async () => {
    const onSubmit = renderDialog();

    type(t("readRules.findPlaceholderPATTERN"), "ລ 30 70");
    type(t("readRules.replacePlaceholderPATTERN"), "30=100");
    submit();

    await waitFor(() => expect(screen.getByText(t("readRules.validation.patternNeedsSlot"))).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
