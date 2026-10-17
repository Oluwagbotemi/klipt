import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading content"
      className="flex flex-col gap-4 px-4 py-5 sm:px-8 sm:py-6"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <Skeleton className="h-10 w-full lg:w-80" />
        <Skeleton className="h-10 w-full lg:w-64" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-2xl border">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-none" />
        ))}
      </div>
    </div>
  );
}
