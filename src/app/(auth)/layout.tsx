import { BrandIcon } from "@/config/brand";
import { siteConfig } from "@/config/site";
import { getTranslations } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getTranslations();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* ฝั่งแบรนด์ — แก้ภาพ/ข้อความตรงนี้ให้เข้ากับแต่ละ project */}
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BrandIcon className="size-5" />
          </span>
          {siteConfig.name}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,var(--foreground)_1px,transparent_0)] [background-size:22px_22px]"
        />
        <div className="relative space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">{siteConfig.description}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t("auth.brandTagline")}</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-in-up">{children}</div>
      </div>
    </div>
  );
}
