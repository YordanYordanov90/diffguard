import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <section
      className="space-y-6"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-36 bg-bg-raised" />
        <Skeleton className="h-4 w-80 max-w-[85vw] bg-bg-raised" />
      </div>

      {/* Protection summary strip */}
      <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <div className="border-b border-border-default px-4 py-3 sm:px-5">
          <Skeleton className="h-3 w-36 bg-bg-raised" />
        </div>
        <div className="flex flex-wrap divide-x divide-border-default">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="flex items-baseline gap-2 px-4 py-3 sm:px-5"
            >
              <Skeleton className="h-4 w-6 bg-bg-raised" />
              <Skeleton className="h-3 w-20 bg-bg-raised" />
            </div>
          ))}
        </div>
      </div>

      {/* Coverage rail */}
      <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <div className="border-b border-border-default px-4 py-3 sm:px-5">
          <Skeleton className="h-3 w-40 bg-bg-raised" />
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full bg-bg-raised" />
            <Skeleton className="h-4 w-40 bg-bg-raised" />
            <Skeleton className="hidden h-3 w-48 bg-bg-raised sm:block" />
          </div>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 pl-5">
              <Skeleton className="h-4 w-4 shrink-0 bg-bg-raised" />
              <Skeleton className="h-4 w-48 max-w-[40vw] bg-bg-raised" />
              <Skeleton className="ml-auto hidden h-3 w-28 bg-bg-raised sm:block" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent reviews panel */}
      <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3 sm:px-5">
          <Skeleton className="h-3 w-28 bg-bg-raised" />
          <Skeleton className="h-3 w-24 bg-bg-raised" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex h-12 items-center gap-6 border-b border-border-default px-4 last:border-b-0"
          >
            <Skeleton className="h-3 w-40 max-w-[30vw] bg-bg-raised" />
            <Skeleton className="h-3 w-10 bg-bg-raised" />
            <Skeleton className="h-5 w-16 rounded-md bg-bg-raised" />
            <Skeleton className="ml-auto h-3 w-16 bg-bg-raised" />
          </div>
        ))}
      </div>
    </section>
  );
}
