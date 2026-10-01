"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { buildQueryString, toRoute } from "@/lib/query";
import { useI18n } from "@/i18n/client";
import { startRouteProgress } from "@/components/shared/route-progress";

/**
 * ช่องค้นหามาตรฐาน — เขียนค่าลง URL (?q=) แบบ debounce
 * server component จะอ่านค่านี้ไปใส่ where ของ Prisma เอง
 */
export function SearchInput({
  placeholderKey = "table.search",
  delay = 350,
}: {
  placeholderKey?: string;
  delay?: number;
}) {
  const { t } = useI18n();
  const placeholder = t(placeholderKey);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = searchParams.get("q") ?? "";
  const [value, setValue] = React.useState(initial);
  const [isPending, startTransition] = React.useTransition();

  // ค่าจาก URL เปลี่ยนจากทางอื่น (เช่นกดปุ่ม back) ให้ช่องค้นหาตามไปด้วย
  React.useEffect(() => setValue(initial), [initial]);

  React.useEffect(() => {
    if (value === initial) return;

    const timer = setTimeout(() => {
      const qs = buildQueryString(searchParams, { q: value, page: 1 });
      startRouteProgress();
      startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
    }, delay);

    return () => clearTimeout(timer);
  }, [value, initial, delay, pathname, router, searchParams]);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pr-9 pl-9"
        aria-label={placeholder}
      />
      {isPending ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label={t("table.clearSearch")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
