import type { OverviewSummary } from "@/lib/dashboard/types";

type OverviewSummaryStripProps = {
  summary: OverviewSummary;
};

const items: {
  key: keyof OverviewSummary;
  label: string;
}[] = [
  { key: "installationCount", label: "Installations" },
  { key: "repositoryCount", label: "Repositories" },
  { key: "reviewsToday", label: "Reviews today" },
  { key: "attentionCount", label: "Need attention" },
];

export function OverviewSummaryStrip({ summary }: OverviewSummaryStripProps) {
  return (
    <section
      aria-label="Overview totals"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default sm:grid-cols-4"
    >
      {items.map(({ key, label }) => (
        <div key={key} className="bg-bg-surface px-4 py-3 sm:px-5 sm:py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {label}
          </p>
          <p
            className={
              key === "attentionCount" && summary.attentionCount > 0
                ? "mt-1 font-mono text-2xl font-semibold tracking-tight text-state-warning"
                : "mt-1 font-mono text-2xl font-semibold tracking-tight text-text-primary"
            }
          >
            {summary[key]}
          </p>
        </div>
      ))}
    </section>
  );
}
