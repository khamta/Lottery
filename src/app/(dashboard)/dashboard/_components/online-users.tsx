"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnlineDot } from "@/components/shared/online-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useI18n } from "@/i18n/client";

export type OnlineUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type OnlineUsersProps = {
  users: OnlineUser[];
  /** จำนวนที่ออนไลน์จริงทั้งหมด (users อาจถูกตัดให้เหลือแค่ส่วนหนึ่ง) */
  total: number;
  currentUserId: string;
};

/** การ์ด "ใครกำลังใช้ระบบอยู่" — ข้อมูลมาจาก server component, หน้าเว็บ refresh เองด้วย <LiveRefresh /> */
export function OnlineUsers({ users, total, currentUserId }: OnlineUsersProps) {
  const { t } = useI18n();
  const hidden = total - users.length;

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2">
          <OnlineDot online className="ring-0" />
          {t("presence.title")}
        </CardTitle>
        <CardDescription>{t("presence.count", { count: total })}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {users.map((user) => (
            <li key={user.id} className="flex min-w-0 items-center gap-3">
              <span className="relative shrink-0">
                <UserAvatar name={user.name} email={user.email} image={user.image} className="size-9" />
                <OnlineDot online className="absolute right-0 bottom-0" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {user.name ?? t("user.fallbackName")}
                  {user.id === currentUserId ? (
                    <span className="ml-1 font-normal text-muted-foreground">{t("presence.you")}</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("presence.more", { count: hidden })}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
