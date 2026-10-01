"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navGroups } from "@/config/nav";
import { useI18n } from "@/i18n/client";

export function NavLinks({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: "ADMIN" | "USER";
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className={cn("flex flex-col gap-5 py-4", collapsed ? "px-2" : "px-3")}>
      {navGroups.map((group) => {
        const items = group.items.filter((item) => !item.roles || item.roles.includes(role));
        if (items.length === 0) return null;

        return (
          <div key={group.labelKey} className="space-y-1">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t" aria-hidden />
            ) : (
              <p className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t(group.labelKey)}
              </p>
            )}

            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const label = t(item.titleKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-label={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center rounded-md text-sm font-medium transition-colors",
                    collapsed ? "justify-center p-2.5" : "gap-3 px-2.5 py-2",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {collapsed ? null : label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
