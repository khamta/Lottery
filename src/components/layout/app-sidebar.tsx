"use client";

import * as React from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/config/brand";
import { siteConfig } from "@/config/site";
import { useI18n } from "@/i18n/client";
import { NavLinks } from "@/components/layout/nav-links";

export const SIDEBAR_COOKIE = "sidebar";

/**
 * Sidebar ย่อ/ขยายได้ — จำสถานะไว้ใน cookie
 * (ใช้ cookie ไม่ใช่ localStorage เพื่อให้ server render ความกว้างถูกตั้งแต่ครั้งแรก ไม่มีอาการกระพริบ)
 */
export function AppSidebar({
  role,
  defaultCollapsed = false,
}: {
  role: "ADMIN" | "USER";
  defaultCollapsed?: boolean;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden shrink-0 border-r bg-sidebar transition-[width] duration-200 ease-out lg:flex lg:flex-col",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b",
          collapsed ? "justify-center px-2" : "gap-2 px-4",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 overflow-hidden font-semibold"
          title={siteConfig.name}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BrandIcon />
          </span>
          {collapsed ? null : <span className="truncate">{siteConfig.name}</span>}
        </Link>
      </div>

      <div className="scroll-area flex-1 overflow-x-hidden overflow-y-auto">
        <NavLinks role={role} collapsed={collapsed} />
      </div>

      <div className={cn("flex items-center border-t p-2", collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? null : <span className="pl-2 text-xs text-muted-foreground">v1.0.0</span>}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
    </aside>
  );
}
