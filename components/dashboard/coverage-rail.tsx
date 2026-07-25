import { formatCoverageDetail } from "@/lib/dashboard/coverage";
import type { InstallationCoverageGroup } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type CoverageRailProps = {
  groups: InstallationCoverageGroup[];
};

function Marker({
  attention,
  awaiting,
}: {
  attention: boolean;
  awaiting: boolean;
}) {
  if (attention) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center font-mono text-xs font-semibold text-state-warning"
        aria-hidden
      >
        !
      </span>
    );
  }
  if (awaiting) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center font-mono text-xs text-text-muted"
        aria-hidden
      >
        ○
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center font-mono text-xs text-state-success"
      aria-hidden
    >
      ✓
    </span>
  );
}

export function CoverageRail({ groups }: CoverageRailProps) {
  return (
    <section
      aria-labelledby="coverage-heading"
      className="overflow-hidden rounded-lg border border-border-default bg-bg-surface"
    >
      <div className="border-b border-border-default px-5 py-4">
        <h2
          id="coverage-heading"
          className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted"
        >
          Repository coverage
        </h2>
      </div>

      <ul className="divide-y divide-border-default">
        {groups.map((group) => (
          <li key={group.installationId} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    group.suspended ? "bg-state-warning" : "bg-accent-primary",
                  )}
                  aria-hidden
                />
                <p className="truncate font-mono text-sm font-medium text-text-primary">
                  {group.accountLogin}
                </p>
              </div>
              <p className="font-mono text-xs text-text-muted">
                {group.repositorySelectionLabel}
                <span className="mx-1.5 text-border-default" aria-hidden>
                  ·
                </span>
                <span
                  className={cn(
                    group.suspended ? "text-state-warning" : "text-text-muted",
                  )}
                >
                  {group.installationState}
                </span>
                <span className="mx-1.5 text-border-default" aria-hidden>
                  ·
                </span>
                <span className="text-text-primary">
                  {group.repositoryCount}{" "}
                  {group.repositoryCount === 1 ? "repo" : "repos"}
                </span>
              </p>
            </div>

            {group.repositories.length === 0 ? (
              <p className="mt-3 pl-4 text-sm text-text-muted">
                No repositories synced yet for this installation.
              </p>
            ) : (
              <ul className="mt-3 space-y-1 border-l border-border-default pl-4">
                {group.repositories.map((repo) => {
                  const detail = formatCoverageDetail(repo);
                  return (
                    <li
                      key={repo.repositoryId}
                      className="flex items-start justify-between gap-3 py-1.5"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <Marker
                          attention={repo.attention}
                          awaiting={repo.label === "Awaiting first review"}
                        />
                        <span className="truncate font-mono text-sm text-text-primary">
                          {repo.fullName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-right text-xs",
                          repo.attention
                            ? "text-state-warning"
                            : "text-text-muted",
                        )}
                      >
                        {detail}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
