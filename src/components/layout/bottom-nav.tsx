"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { MobileMoreSheet } from "@/components/layout/mobile-nav";
import { navGroups, type NavItem } from "@/config/nav";
import { useI18n } from "@/i18n/client";

/** จำนวนแท็บที่โชว์ตรง ๆ ที่เหลือจะไปอยู่ในปุ่ม "เพิ่มเติม" */
const MAX_TABS = 4;

/**
 * ============================================================================
 * แถบเมนูล่างจอสำหรับมือถือ — ให้ความรู้สึกเหมือนแอปจริง
 * ============================================================================
 * - แสดงเฉพาะจอเล็ก (ซ่อนเมื่อ lg ขึ้นไป เพราะมี sidebar แล้ว)
 * - เมนูมาจาก config/nav.ts ชุดเดียวกับ sidebar จึงไม่มีทางหลุดกัน
 * - เกิน 4 เมนูจะยุบไปอยู่ในปุ่ม "เพิ่มเติม" ที่เปิด sheet ขึ้นมา
 * - เผื่อพื้นที่ปุ่มโฮมของ iPhone ด้วย env(safe-area-inset-bottom)
 */
export function BottomNav({ role }: { role: "ADMIN" | "USER" }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const items = React.useMemo(
    () =>
      navGroups
        .flatMap((group) => group.items)
        .filter((item) => !item.roles || item.roles.includes(role)),
    [role],
  );

  const tabs = items.length > MAX_TABS ? items.slice(0, MAX_TABS - 1) : items.slice(0, MAX_TABS);
  const hasMore = items.length > tabs.length;

  const isActive = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const moreActive = hasMore && items.slice(tabs.length).some(isActive);

  return (
    <>
      <nav
        aria-label={t("nav.openMenu")}
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="flex items-stretch">
          {tabs.map((item) => {
            const active = isActive(item);

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      active && "bg-primary/12",
                    )}
                  >
                    <item.icon className="size-5" />
                  </span>
                  <span className="max-w-full truncate">{t(item.titleKey)}</span>
                </Link>
              </li>
            );
          })}

          {hasMore ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={cn(
                  "flex w-full flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                  moreActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    moreActive && "bg-primary/12",
                  )}
                >
                  <MoreHorizontal className="size-5" />
                </span>
                <span>{t("nav.more")}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} role={role} />
    </>
  );
}
