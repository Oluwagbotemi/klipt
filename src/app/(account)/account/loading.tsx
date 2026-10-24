import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading account"
      className="flex w-full flex-col gap-6 px-4 py-6 sm:px-8"
    >
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-2xl" />
      ))}
    </div>
  );
}
