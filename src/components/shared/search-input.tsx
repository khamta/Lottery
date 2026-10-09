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

  // ยุบเหลือปุ่มไอคอนจนกว่าจะกด — มีคำค้นอยู่แล้วกางค้างไว้ · ช่องว่างแล้วออกจากช่อง = ยุบกลับ
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const expanded = open || value !== "";

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={placeholder}
        title={placeholder}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <div className="relative min-w-0 flex-1 animate-in-up sm:max-w-xs">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus={open}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !value) inputRef.current?.blur();
        }}
        placeholder={placeholder}
        className="pr-9 pl-9"
        aria-label={placeholder}
      />
      {isPending ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            setOpen(true);
            inputRef.current?.focus();
          }}
          aria-label={t("table.clearSearch")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
