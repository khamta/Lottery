import { TableSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32 sm:h-7" />
        <Skeleton className="h-3.5 w-full max-w-80 sm:h-4" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-full sm:w-32" />
      </div>
      <TableSkeleton columns={7} />
    </div>
  );
}
