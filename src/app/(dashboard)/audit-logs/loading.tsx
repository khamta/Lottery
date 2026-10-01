import { TableSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-9 flex-1 sm:w-64" />
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Skeleton className="h-9 flex-1 sm:w-40" />
          <Skeleton className="h-9 flex-1 sm:w-40" />
        </div>
      </div>
      <TableSkeleton columns={5} />
    </div>
  );
}
