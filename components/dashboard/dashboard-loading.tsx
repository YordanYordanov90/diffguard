import { LoaderCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <section
      className="space-y-6"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-accent-primary">
            <LoaderCircle
              className="motion-safe:animate-spin h-4 w-4"
              aria-hidden
            />
            <span className="font-mono text-xs uppercase tracking-[0.18em]">
              Loading workspace
            </span>
          </div>
          <Skeleton className="h-8 w-40 bg-bg-raised" />
          <Skeleton className="h-4 w-72 max-w-[70vw] bg-bg-raised" />
        </div>
      </div>

      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        <Skeleton className="h-3 w-36 bg-bg-raised" />
        <Skeleton className="mt-3 h-9 w-16 bg-bg-raised" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <div className="flex h-12 items-center gap-6 border-b border-border-default px-4">
          <Skeleton className="h-3 w-28 bg-bg-raised" />
          <Skeleton className="h-3 w-10 bg-bg-raised" />
          <Skeleton className="h-3 w-16 bg-bg-raised" />
          <Skeleton className="h-3 w-16 bg-bg-raised" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex h-14 items-center gap-6 border-b border-border-default px-4 last:border-b-0"
          >
            <Skeleton className="h-3 w-48 max-w-[30vw] bg-bg-raised" />
            <Skeleton className="h-3 w-10 bg-bg-raised" />
            <Skeleton className="h-6 w-20 rounded-md bg-bg-raised" />
            <Skeleton className="h-3 w-12 bg-bg-raised" />
          </div>
        ))}
      </div>
    </section>
  );
}
