import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { OnlineUsers } from "@/app/(dashboard)/dashboard/_components/online-users";
import { defaultLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { translateWith } from "@/i18n/translate";

afterEach(cleanup);

// ไม่มี I18nProvider → useI18n() ใช้ภาษา default เทียบข้อความจาก dictionary เดียวกัน
const tr = (key: string, params?: Record<string, number>) =>
  translateWith(dictionaries[defaultLocale], key, params);

const users = [
  { id: "u1", name: "สมชาย ใจดี", email: "somchai@example.com", image: null },
  { id: "u2", name: null, email: "noname@example.com", image: null },
];

describe("<OnlineUsers />", () => {
  test("แสดงจำนวนคนออนไลน์และรายชื่อ", () => {
    render(<OnlineUsers users={users} total={2} currentUserId="u2" />);

    expect(screen.getByText(tr("presence.count", { count: 2 }))).toBeDefined();
    expect(screen.getByText("สมชาย ใจดี")).toBeDefined();
    expect(screen.getByText("noname@example.com")).toBeDefined();
  });

  test("ติดป้าย (คุณ) ให้ผู้ใช้ปัจจุบันเท่านั้น", () => {
    render(<OnlineUsers users={users} total={2} currentUserId="u2" />);
    expect(screen.getAllByText(tr("presence.you"))).toHaveLength(1);
  });

  test("มีคนออนไลน์มากกว่าที่แสดง → บอกจำนวนที่เหลือ", () => {
    render(<OnlineUsers users={users} total={7} currentUserId="u1" />);
    expect(screen.getByText(tr("presence.more", { count: 5 }))).toBeDefined();
  });
});
