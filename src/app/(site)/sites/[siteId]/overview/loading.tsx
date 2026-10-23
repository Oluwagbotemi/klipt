import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="bg-canvas flex flex-1 flex-col md:rounded-b-3xl"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-64 rounded-xl" />
            <Skeleton className="h-7 w-80 max-w-full rounded-full" />
          </div>
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-(--radius-card)" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
          <Skeleton className="h-80 rounded-(--radius-card) lg:col-span-8" />
          <Skeleton className="h-80 rounded-(--radius-card) lg:col-span-4" />
        </div>
      </div>
    </div>
  );
}
