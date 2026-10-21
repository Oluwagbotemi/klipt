import { Skeleton } from "@/components/ui/skeleton";

/** Keeps the section header and tabs visible while a tab's content loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3 px-4 py-6 sm:px-8">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}
