import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3 border-b border-dashed px-4 py-5 sm:px-8 sm:py-6">
        <Skeleton className="h-4 w-64" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <Skeleton className="h-7 w-72" />
        </div>
      </div>
      <div className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
