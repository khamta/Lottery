import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { dictionaries } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/config";
import { translateWith } from "@/i18n/translate";

// ไม่มี I18nProvider ในเทสต์ → useI18n() คืน t ตัวใหม่ทุก render ทำให้ effect ที่ reset ฟอร์มวนไม่จบ
// จึงใช้ t ตัวเดียวคงที่ (แบบเดียวกับที่ provider ให้ในแอปจริง)
const i18n = {
  locale: defaultLocale,
  intl: "lo-LA",
  t: (key: string, params?: Record<string, string | number>) => translateWith(dictionaries[defaultLocale], key, params),
  setLocale: () => {},
};
mock.module("@/i18n/client", () => ({ useI18n: () => i18n }));

const { DrawDialog } = await import("@/app/(dashboard)/draws/_components/draw-dialog");
const { DealerDialog } = await import("@/app/(dashboard)/dealers/_components/dealer-dialog");

afterEach(cleanup);

function submit() {
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
}

describe("<DrawDialog /> (เปิดงวดใหม่ / แก้งวด)", () => {
  test("เปิดงวดใหม่ด้วยค่าตั้งต้น (เวลาออกผลตามงวดล่าสุดของประเภทนั้น) → บันทึกได้", async () => {
    const onSubmit = mock((_values: unknown) => {});
    render(<DrawDialog open onOpenChange={() => {}} draw={null} closeTimes={{ LAO: "20:30" }} onSubmit={onSubmit} />);

    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ lottery: "LAO", closeTime: "20:30" });
  });

  test("แก้งวดแล้วกรอกเลขที่ออกครบ → บันทึกได้", async () => {
    const onSubmit = mock((_values: unknown) => {});
    render(
      <DrawDialog
        open
        onOpenChange={() => {}}
        closeTimes={{}}
        draw={{
          id: "draw-1",
          name: "ງວດ 01/10/2026",
          lottery: "LAO",
          closeTime: null,
          drawDate: "2026-10-01",
          status: "OPEN",
          topResult: null,
          bottomResult: null,
          ticketCount: 0,
          updatedAt: "2026-10-01T00:00:00.000Z",
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("000"), { target: { value: "243" } });
    fireEvent.change(screen.getByPlaceholderText("00"), { target: { value: "72" } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ topResult: "243", bottomResult: "72" });
  });
});

describe("<DealerDialog />", () => {
  test("ฟอร์มไม่มีช่องอัตราจ่าย และบันทึกได้ (รุ่น AI ที่เลือกไว้ส่งกลับตามเดิม)", async () => {
    const onSubmit = mock((_values: unknown) => {});
    render(
      <DealerDialog
        open
        onOpenChange={() => {}}
        dealer={{
          id: "dealer-1",
          name: "tar",
          note: null,
          ocrModel: "gemma4:31b",
          ocrStrongModel: "claude-opus-5-5",
          ownerName: null,
          drawCount: 0,
          customerCount: 0,
          groupCount: 0,
          updatedAt: "2026-10-01T00:00:00.000Z",
        }}
        ocrDefaults={{ model: "claude-sonnet-5-5", strongModel: "claude-opus-5-5" }}
        ollamaModels={["gemma4:31b"]}
        ollamaAccess={{ "gemma4:31b": "ok" }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    fireEvent.change(screen.getByDisplayValue("tar"), { target: { value: "ເປບຊີ່" } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      name: "ເປບຊີ່",
      note: "",
      ocrModel: "gemma4:31b",
      ocrStrongModel: "claude-opus-5-5",
    });
  });
});
