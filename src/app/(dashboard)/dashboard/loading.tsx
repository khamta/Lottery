import { StatCardsSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1.5 sm:space-y-2">
        <Skeleton className="h-6 w-40 sm:h-7 sm:w-48" />
        <Skeleton className="h-3.5 w-full max-w-72 sm:h-4" />
      </div>
      <StatCardsSkeleton />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}
