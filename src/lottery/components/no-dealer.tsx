import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";

/** บัญชีที่ยังไม่มีแม่หวย — ทุกหน้าของระบบหวยแสดงหน้านี้แทน แล้วพาไปสร้างที่ /dealers */
export async function NoDealer({ title, description }: { title: string; description?: string }) {
  const { t } = await getTranslations();

  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        title={t("dealers.noneTitle")}
        description={t("dealers.noneDesc")}
        action={
          <Button asChild>
            <Link href="/dealers">{t("dealers.add")}</Link>
          </Button>
        }
      />
    </>
  );
}
