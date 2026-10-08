import { TableSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-full max-w-80 sm:h-4" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <TableSkeleton columns={3} />
    </div>
  );
}
