import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { BrandIcon } from "@/config/brand";
import { siteConfig } from "@/config/site";

type AppHeaderProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "ADMIN" | "USER";
  };
};

/**
 * แถบบน — บนมือถือแสดงโลโก้+ชื่อแอป (เมนูย้ายไปอยู่แถบล่างแบบแอปจริง)
 * บนจอใหญ่ชื่อแอปอยู่ใน sidebar แล้ว จึงเหลือแค่ปุ่มด้านขวา
 *
 * สูง 56px (+ safe-area ด้านบนเมื่อเปิดเต็มจอแบบ PWA/ใต้รอยบาก) ปุ่มไอคอนบนมือถือ 40px ตามขนาดแตะขั้นต่ำ
 */
export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-0.5 border-b bg-background/85 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur sm:gap-1 sm:pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))]">
      <Link
        href="/dashboard"
        className="flex min-h-10 min-w-0 items-center gap-2 text-[1.0625rem] font-semibold tracking-tight sm:text-base sm:tracking-normal lg:hidden"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BrandIcon />
        </span>
        <span className="truncate">{siteConfig.name}</span>
      </Link>

      <div className="flex-1" />
      <LanguageSwitcher />
      <ThemeToggle />
      <UserMenu {...user} />
    </header>
  );
}
