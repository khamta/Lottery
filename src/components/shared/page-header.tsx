import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pb-2",
        className,
      )}
    >
      {/* มือถือ: หัวข้อ 20px + คำอธิบาย 13px แบบ large title ของแอป — จอใหญ่เหมือนเดิม */}
      <div className="min-w-0 space-y-0.5 sm:space-y-1">
        <h1 className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl sm:leading-8">{title}</h1>
        {description ? (
          <p className="text-[0.8125rem] leading-snug text-muted-foreground sm:text-sm sm:leading-5">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
