import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar, SIDEBAR_COOKIE } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PresenceHeartbeat } from "@/components/layout/presence-heartbeat";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // อ่านสถานะ sidebar จาก cookie เพื่อให้ render ความกว้างถูกตั้งแต่ครั้งแรก
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  // ชื่อ/รูปอ่านจากฐานข้อมูลทุกครั้ง (ไม่ใช้ค่าใน JWT) — แก้โปรไฟล์แล้วแถบบนเปลี่ยนทันทีไม่ต้อง login ใหม่
  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true },
  });

  const user = {
    name: profile?.name ?? session.user.name,
    email: profile?.email ?? session.user.email,
    image: profile ? profile.image : session.user.image,
    role: session.user.role,
  };

  return (
    <div className="flex min-h-dvh">
      {/* จอใหญ่: sidebar ย่อ/ขยายได้ — จอเล็ก: แถบเมนูล่างจอแบบแอป */}
      <AppSidebar role={user.role} defaultCollapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />

        {/* มือถือ: ขอบ 16px + ระยะห่าง 16px แบบแอป (เผื่อรอยบากซ้าย/ขวาตอนหมุนจอ)
            เว้นที่ด้านล่างให้แถบเมนูมือถือ (คำนวณรวม safe-area ของ iPhone แล้ว) — จอใหญ่เหมือนเดิม */}
        <main className="flex-1 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:pt-6 sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] lg:pb-6">
          <div className="w-full space-y-4 sm:space-y-6">{children}</div>
        </main>
      </div>

      <BottomNav role={user.role} />
      <PresenceHeartbeat />
    </div>
  );
}
