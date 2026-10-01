import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AvatarPreviewDialog, AvatarViewerDialog } from "@/app/(dashboard)/profile/_components/avatar-dialogs";

afterEach(cleanup);

const src = "data:image/png;base64,iVBORw0KGgo=";

describe("<AvatarPreviewDialog /> (ดูรูปก่อนบันทึก)", () => {
  test("ไม่มีรูปที่เลือก → ไม่เปิดหน้าต่าง", () => {
    render(
      <AvatarPreviewDialog src={null} name="Kim" email="kim@example.com" onConfirm={() => {}} onChooseAnother={() => {}} onCancel={() => {}} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("แสดงรูปที่เลือก และกด ໃຊ້ຮູບນີ້ แล้วเรียก onConfirm", () => {
    const onConfirm = mock(() => {});
    render(
      <AvatarPreviewDialog src={src} name="Kim" email="kim@example.com" onConfirm={onConfirm} onChooseAnother={() => {}} onCancel={() => {}} />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(`img[src="${src}"]`)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /ໃຊ້ຮູບນີ້/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("<AvatarViewerDialog /> (ดูรูปเต็มขนาด + ดาวน์โหลด)", () => {
  test("กดดาวน์โหลด → สร้างลิงก์ดาวน์โหลดชื่อไฟล์ตามชื่อผู้ใช้ + นามสกุลตามชนิดรูป", async () => {
    const originalFetch = globalThis.fetch;
    const originalCreate = URL.createObjectURL;
    const clicked: string[] = [];
    globalThis.fetch = (async () => new Response(new Blob(["x"], { type: "image/webp" }))) as unknown as typeof fetch;
    URL.createObjectURL = () => "blob:avatar";
    const clickSpy = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    };

    try {
      render(
        <AvatarViewerDialog src="/api/avatar/u1?v=1" name="Kim Lee" open onOpenChange={() => {}} onChange={() => {}} onRemove={() => {}} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /ດາວໂຫຼດ/ }));
      await waitFor(() => expect(clicked).toEqual(["profile-Kim-Lee.webp"]));
    } finally {
      globalThis.fetch = originalFetch;
      URL.createObjectURL = originalCreate;
      HTMLAnchorElement.prototype.click = clickSpy;
    }
  });
});
