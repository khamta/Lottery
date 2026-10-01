import { cn } from "@/lib/utils";

/** จุดสถานะออนไลน์ — วางมุมรูปโปรไฟล์ (ครอบด้วย `relative`) หรือหน้าข้อความ */
export function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-online={online}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full ring-2 ring-background",
        online ? "bg-success" : "bg-muted-foreground/40",
        className,
      )}
    />
  );
}
