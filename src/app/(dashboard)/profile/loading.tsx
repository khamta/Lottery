import { FormSkeleton } from "@/components/shared/loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="overflow-hidden rounded-xl border bg-card">
        <Skeleton className="h-24 rounded-none" />
        <div className="-mt-12 flex flex-col items-center gap-3 px-6 pb-6">
          <Skeleton className="size-24 rounded-full border-4 border-card" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-xl border bg-card p-6">
          <FormSkeleton fields={2} />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <FormSkeleton fields={3} />
        </div>
      </div>
    </div>
  );
}
