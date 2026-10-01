import { StatCardsSkeleton, TableSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1.5 sm:space-y-2">
        <Skeleton className="h-6 w-36 sm:h-7 sm:w-44" />
        <Skeleton className="h-3.5 w-full max-w-80 sm:h-4" />
      </div>
      <StatCardsSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <TableSkeleton columns={6} rows={10} />
    </div>
  );
}
