import type { OverviewSummary } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type OverviewSummaryStripProps = {
  summary: OverviewSummary;
};

function Metric({
  value,
  label,
  emphasize = false,
}: {
  value: number;
  label: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 px-4 py-3 sm:px-5">
      <span
        className={cn(
          "font-mono text-sm font-medium tabular-nums",
          emphasize ? "text-state-warning" : "text-text-primary",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "truncate text-xs",
          emphasize ? "text-state-warning" : "text-text-muted",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function OverviewSummaryStrip({ summary }: OverviewSummaryStripProps) {
  const attentionActive = summary.attentionCount > 0;

  return (
    <section
      aria-label="Protection summary"
      className="overflow-hidden rounded-lg border border-border-default bg-bg-surface"
    >
      <div className="border-b border-border-default px-4 py-3 sm:px-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          Protection summary
        </h2>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border-default sm:grid-cols-4 sm:divide-y-0">
        <Metric
          value={summary.installationCount}
          label={
            summary.installationCount === 1 ? "installation" : "installations"
          }
        />
        <Metric
          value={summary.repositoryCount}
          label={
            summary.repositoryCount === 1 ? "repository" : "repositories"
          }
        />
        <Metric
          value={summary.reviewsToday}
          label={summary.reviewsToday === 1 ? "review today" : "reviews today"}
        />
        <Metric
          value={summary.attentionCount}
          label={
            summary.attentionCount === 1 ? "needs attention" : "need attention"
          }
          emphasize={attentionActive}
        />
      </div>
    </section>
  );
}
