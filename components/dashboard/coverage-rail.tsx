import type { ReactNode } from "react";

import { formatCoverageDetail } from "@/lib/dashboard/coverage";
import type {
  InstallationCoverageGroup,
  RepositoryCoverageRow,
} from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type CoverageRailProps = {
  groups: InstallationCoverageGroup[];
  /** Optional row actions (repositories page). */
  renderActions?: (repo: RepositoryCoverageRow) => ReactNode;
  /** Optional installation-level action (Manage on GitHub). */
  renderGroupAction?: (group: InstallationCoverageGroup) => ReactNode;
};

function CoverageMarker({
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

/**
 * Shared left rail column: continuous vertical segment with a node or
 * branch connector. Installation and repository rows align on this axis.
 */
function RailColumn({
  variant,
  suspended,
  isLast,
}: {
  variant: "installation" | "repository";
  suspended?: boolean;
  isLast?: boolean;
}) {
  if (variant === "installation") {
    return (
      <div
        className="relative flex w-5 shrink-0 flex-col items-center self-stretch"
        aria-hidden
      >
        <span
          className={cn(
            "relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-surface",
            suspended ? "bg-state-warning" : "bg-accent-primary",
          )}
        />
        <span className="absolute top-4 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border-default" />
      </div>
    );
  }

  return (
    <div
      className="relative flex w-5 shrink-0 flex-col items-center self-stretch"
      aria-hidden
    >
      <span
        className={cn(
          "absolute left-1/2 w-px -translate-x-1/2 bg-border-default",
          isLast ? "top-0 h-3.5" : "inset-y-0",
        )}
      />
      <span className="absolute top-3.5 left-1/2 h-px w-2.5 bg-border-default" />
    </div>
  );
}

function InstallationNode({
  suspended,
  hasRepos,
}: {
  suspended: boolean;
  hasRepos: boolean;
}) {
  if (!hasRepos) {
    return (
      <div
        className="relative flex w-5 shrink-0 flex-col items-center"
        aria-hidden
      >
        <span
          className={cn(
            "mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-surface",
            suspended ? "bg-state-warning" : "bg-accent-primary",
          )}
        />
      </div>
    );
  }

  return <RailColumn variant="installation" suspended={suspended} />;
}

function InstallationHeader({
  group,
  action,
}: {
  group: InstallationCoverageGroup;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <p
          className="truncate font-mono text-sm font-medium text-text-primary"
          title={group.accountLogin}
        >
          {group.accountLogin}
        </p>
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
      {action}
    </div>
  );
}

function RepositoryRow({
  repo,
  isLast,
  actions,
}: {
  repo: RepositoryCoverageRow;
  isLast: boolean;
  actions?: ReactNode;
}) {
  const detail = formatCoverageDetail(repo);
  const awaiting = repo.label === "Awaiting first review";

  return (
    <li className="flex gap-0">
      <RailColumn variant="repository" isLast={isLast} />
      <div
        className={cn(
          "min-w-0 flex-1 rounded-md py-2 pr-1 pl-1 transition-colors hover:bg-bg-raised/50 focus-within:bg-bg-raised/50",
          actions && "sm:flex sm:items-center sm:justify-between sm:gap-3",
        )}
      >
        <div
          className={cn(
            "grid min-w-0 grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] sm:items-center sm:gap-4",
            actions && "sm:flex-1",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CoverageMarker attention={repo.attention} awaiting={awaiting} />
            <span className="truncate font-mono text-sm text-text-primary" title={repo.fullName}>
              {repo.fullName}
            </span>
          </div>
          <span
            className={cn(
              "pl-7 text-xs sm:pl-0 sm:text-right",
              repo.attention ? "text-state-warning" : "text-text-muted",
            )}
          >
            {detail}
          </span>
        </div>
        {actions ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 sm:mt-0 sm:pl-0">
            {actions}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function InstallationSegment({
  group,
  renderActions,
  renderGroupAction,
}: {
  group: InstallationCoverageGroup;
  renderActions?: (repo: RepositoryCoverageRow) => ReactNode;
  renderGroupAction?: (group: InstallationCoverageGroup) => ReactNode;
}) {
  const hasRepos = group.repositories.length > 0;

  return (
    <li className="px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex gap-0">
        <InstallationNode
          suspended={group.suspended}
          hasRepos={hasRepos}
        />
        <InstallationHeader
          group={group}
          action={renderGroupAction?.(group)}
        />
      </div>

      {hasRepos ? (
        <ul>
          {group.repositories.map((repo, index) => (
            <RepositoryRow
              key={repo.repositoryId}
              repo={repo}
              isLast={index === group.repositories.length - 1}
              actions={renderActions?.(repo)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 pl-5 text-sm text-text-muted">
          No repositories synced yet for this installation.
        </p>
      )}
    </li>
  );
}

export function CoverageRail({
  groups,
  renderActions,
  renderGroupAction,
}: CoverageRailProps) {
  return (
    <section
      aria-labelledby="coverage-heading"
      className="overflow-hidden rounded-lg border border-border-default bg-bg-surface"
    >
      <div className="border-b border-border-default px-4 py-3 sm:px-5">
        <h2
          id="coverage-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
        >
          Repository coverage
        </h2>
      </div>

      <ul className="divide-y divide-border-default">
        {groups.map((group) => (
          <InstallationSegment
            key={group.installationId}
            group={group}
            renderActions={renderActions}
            renderGroupAction={renderGroupAction}
          />
        ))}
      </ul>
    </section>
  );
}
