import { TableSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-64" />
      <TableSkeleton columns={5} />
    </div>
  );
}
