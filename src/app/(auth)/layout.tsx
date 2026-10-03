import { CheckCircle2, ShieldCheck } from "lucide-react";

import { BrandIcon } from "@/config/brand";
import { siteConfig } from "@/config/site";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getTranslations } from "@/i18n/server";

/**
 * ลูกบอลเลขลอยไปมาทั่วฝั่งแบรนด์ — เส้นทาง (lotto-path-*) อยู่ใน src/styles/brand.css
 * ค่าตายตัว (ไม่สุ่ม) เพื่อให้ server/client render ตรงกัน · delay ติดลบ = เริ่มกลางทาง ลูกบอลจึงกระจายตั้งแต่เฟรมแรก
 * top/left ใน style คือตำแหน่งตั้งต้นก่อน CSS โหลด
 */
const BALLS = [
  { n: "27", className: "size-20 text-2xl", path: 1, duration: 16, delay: 0, top: "12%", left: "70%" },
  { n: "49", className: "size-12 text-base opacity-70", path: 2, duration: 12, delay: -4, top: "30%", left: "50%" },
  { n: "08", className: "size-16 text-xl opacity-80", path: 3, duration: 18, delay: -8, top: "44%", left: "82%" },
  { n: "315", className: "size-14 text-base opacity-60", path: 4, duration: 14, delay: -2, top: "65%", left: "60%" },
  { n: "61", className: "size-10 text-sm opacity-60", path: 1, duration: 13, delay: -9, top: "80%", left: "20%" },
  { n: "952", className: "size-16 text-lg opacity-70", path: 2, duration: 17, delay: -12, top: "15%", left: "35%" },
  { n: "13", className: "size-11 text-sm opacity-60", path: 3, duration: 11, delay: -6, top: "85%", left: "75%" },
  { n: "70", className: "size-14 text-lg opacity-75", path: 4, duration: 15, delay: -10, top: "5%", left: "5%" },
];

const POINTS = ["account.brandPoint1", "account.brandPoint2", "account.brandPoint3"] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getTranslations();

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ฝั่งแบรนด์ (จอใหญ่) */}
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:24px_24px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        {BALLS.map((ball) => (
          <span
            key={ball.n}
            aria-hidden
            className={`lotto-ball pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-primary-foreground/40 bg-primary-foreground/10 font-bold tabular-nums shadow-lg backdrop-blur-sm ${ball.className}`}
            style={
              {
                top: ball.top,
                left: ball.left,
                "--ball-path": `lotto-path-${ball.path}`,
                "--ball-duration": `${ball.duration}s`,
                "--ball-delay": `${ball.delay}s`,
              } as React.CSSProperties
            }
          >
            {ball.n}
          </span>
        ))}

        <div className="relative flex items-center gap-3 text-lg font-semibold">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/30">
            <BrandIcon className="size-6" />
          </span>
          {siteConfig.name}
        </div>

        <div className="relative max-w-md space-y-6">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">{t("account.brandHeadline")}</h2>
          <ul className="space-y-3 text-sm">
            {POINTS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 opacity-90" />
                <span className="opacity-90">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs opacity-75">
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
      </aside>

      {/* ฝั่งฟอร์ม */}
      <main className="relative flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-2 font-semibold lg:invisible">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BrandIcon className="size-5" />
            </span>
            {siteConfig.name}
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className="w-full max-w-md animate-in-up rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
            {children}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-6 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> {t("account.secureNote")}
        </p>
      </main>
    </div>
  );
}
