import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";

import { auth } from "@/lib/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { getTranslations } from "@/i18n/server";
import { findAccess } from "@/lottery/access";
import { SignOutButton } from "./_components/sign-out-button";

export const metadata: Metadata = { title: "Account disabled" };

/**
 * บัญชีที่ผู้ดูแลปิดใช้งานแล้วแต่ยังมี session ค้าง (JWT ยังไม่หมดอายุ)
 * ทุกหน้าของระบบหวยส่งมาที่นี่ (src/lottery/access.ts) — ให้ออกจากระบบได้อย่างเดียว
 */
export default async function AccountDisabledPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (await findAccess(session.user.id)) redirect("/dashboard");

  const { t } = await getTranslations();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={UserX}
        title={t("members.disabledTitle")}
        description={t("members.disabledDesc")}
        action={<SignOutButton />}
        className="w-full sm:w-96"
      />
    </main>
  );
}
