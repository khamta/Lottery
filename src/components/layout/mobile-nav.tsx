"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NavLinks } from "@/components/layout/nav-links";
import { siteConfig } from "@/config/site";

/**
 * เมนูที่เหลือของมือถือ — เลื่อนขึ้นมาจากด้านล่างเหมือน action sheet ของแอป
 * ถูกเปิดจากปุ่ม "เพิ่มเติม" ใน <BottomNav />
 */
export function MobileMoreSheet({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "ADMIN" | "USER";
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[75vh] rounded-t-2xl bg-sidebar p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{siteConfig.name}</SheetTitle>
        </SheetHeader>
        <div className="scroll-area overflow-y-auto">
          <NavLinks role={role} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
