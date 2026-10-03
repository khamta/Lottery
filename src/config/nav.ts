import type { Route } from "next";
import {
  CalendarDays,
  ChartColumn,
  MessageCircle,
  Contact,
  History,
  LayoutDashboard,
  ReceiptText,
  ScanText,
  Settings,
  Store,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  /** คีย์ข้อความใน dictionary เช่น "nav.products" — ห้ามใส่ข้อความตรง ๆ เพราะระบบมี 4 ภาษา */
  titleKey: string;
  href: Route;
  icon: LucideIcon;
  /** จำกัดสิทธิ์การเห็นเมนู; ไม่ระบุ = เห็นได้ทุก role */
  roles?: Array<"ADMIN" | "USER">;
};

export type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

/**
 * เพิ่มเมนูของ project ใหม่ได้ที่นี่ที่เดียว sidebar จะอัปเดตเอง
 * 4 เมนูแรกคือแถบล่างจอบนมือถือ (ที่เหลืออยู่ใน "เพิ่มเติม") จึงเรียงตามที่ใช้บ่อยระหว่างรับโพย
 */
export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.groupOverview",
    items: [
      { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
      { titleKey: "nav.tickets", href: "/tickets", icon: ReceiptText },
      { titleKey: "nav.reports", href: "/reports", icon: ChartColumn },
    ],
  },
  {
    labelKey: "nav.groupData",
    items: [
      { titleKey: "nav.dealers", href: "/dealers", icon: Store },
      { titleKey: "nav.draws", href: "/draws", icon: CalendarDays },
      { titleKey: "nav.customers", href: "/customers", icon: Contact },
      { titleKey: "nav.limits", href: "/limits", icon: ShieldAlert },
      { titleKey: "nav.readRules", href: "/read-rules", icon: ScanText },
      { titleKey: "nav.whatsapp", href: "/whatsapp", icon: MessageCircle, roles: ["ADMIN"] },
      { titleKey: "nav.users", href: "/members", icon: Users, roles: ["ADMIN"] },
    ],
  },
  {
    labelKey: "nav.groupSystem",
    items: [
      { titleKey: "nav.settings", href: "/settings", icon: Settings },
      { titleKey: "nav.auditLogs", href: "/audit-logs", icon: History, roles: ["ADMIN"] },
    ],
  },
];
