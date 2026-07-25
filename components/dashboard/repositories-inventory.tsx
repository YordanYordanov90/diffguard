"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  FolderGit2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshDashboardCoverage } from "@/lib/dashboard/actions";
import {
  filterCoverageGroups,
  formatCoverageDetail,
} from "@/lib/dashboard/coverage";
import {
  githubRepoUrl,
  reviewsFilterHref,
} from "@/lib/dashboard/format";
import type { InstallationCoverageGroup } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type RepositoriesInventoryProps = {
  groups: InstallationCoverageGroup[];
  installUrl: string;
};

export function RepositoriesInventory({
  groups,
  installUrl,
}: RepositoriesInventoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterCoverageGroups(groups, query),
    [groups, query],
  );

  const totalRepos = groups.reduce(
    (sum, group) => sum + group.repositoryCount,
    0,
  );
  const visibleRepos = filtered.reduce(
    (sum, group) => sum + group.repositoryCount,
    0,
  );
  const hasQuery = query.trim().length > 0;

  function handleRefresh() {
    setRefreshError(null);
    startTransition(async () => {
      const result = await refreshDashboardCoverage();
      if (!result.success) {
        setRefreshError(result.error ?? "Coverage could not be refreshed.");
        return;
      }
      router.refresh();
    });
  }

  if (totalRepos === 0) {
    return (
      <EmptyRepositories
        installUrl={installUrl}
        onRefresh={handleRefresh}
        isPending={isPending}
        refreshError={refreshError}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories"
            aria-label="Search repositories"
            className="pl-9 pr-9"
          />
          {hasQuery ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted outline-none hover:bg-bg-surface hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-primary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-text-muted">
            {hasQuery
              ? `${visibleRepos} of ${totalRepos}`
              : `${totalRepos} ${totalRepos === 1 ? "repository" : "repositories"}`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border-default bg-bg-surface text-text-primary hover:bg-bg-raised"
            onClick={handleRefresh}
            disabled={isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4", isPending && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>

      {refreshError ? (
        <p className="text-sm text-state-warning" role="status">
          {refreshError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <section className="rounded-lg border border-border-default bg-bg-surface p-8 text-center">
          <h2 className="text-base font-medium text-text-primary">
            No matching repositories
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Clear the search or try another repository name.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 border-border-default bg-bg-raised text-text-primary"
            onClick={() => setQuery("")}
          >
            Clear search
          </Button>
        </section>
      ) : (
        <div className="space-y-4">
          {filtered.map((group) => (
            <InstallationGroup key={group.installationId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstallationGroup({ group }: { group: InstallationCoverageGroup }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
      <div className="flex flex-col gap-3 border-b border-border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                group.suspended ? "bg-state-warning" : "bg-accent-primary",
              )}
              aria-hidden
            />
            <h2 className="truncate font-mono text-sm font-medium text-text-primary">
              {group.accountLogin}
            </h2>
            <span className="hidden font-mono text-xs text-text-muted sm:inline">
              {group.accountType}
            </span>
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
        <a
          href={group.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary sm:self-auto"
        >
          Manage on GitHub
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {group.repositories.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-muted">
          No repositories synced yet for this installation.
        </p>
      ) : (
        <ul className="divide-y divide-border-default">
          {group.repositories.map((repo) => {
            const detail = formatCoverageDetail(repo);
            const openUrl = githubRepoUrl(repo.fullName);
            return (
              <li
                key={repo.repositoryId}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-mono text-sm text-text-primary">
                    {repo.fullName}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      repo.attention
                        ? "text-state-warning"
                        : "text-text-muted",
                    )}
                  >
                    {detail}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={reviewsFilterHref(repo.fullName)}
                    className="inline-flex items-center rounded-md border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary"
                  >
                    View reviews
                  </Link>
                  {openUrl ? (
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary"
                    >
                      Open on GitHub
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EmptyRepositories({
  installUrl,
  onRefresh,
  isPending,
  refreshError,
}: {
  installUrl: string;
  onRefresh: () => void;
  isPending: boolean;
  refreshError: string | null;
}) {
  return (
    <section className="rounded-lg border border-border-default bg-bg-surface p-8 sm:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-default bg-bg-raised">
          <FolderGit2 className="h-5 w-5 text-accent-primary" aria-hidden />
        </span>
        <h2 className="text-lg font-medium text-text-primary">
          Choose repositories on GitHub
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          DiffGuard is installed, but no repositories are covered yet. Select
          repositories on GitHub, then refresh to see updated coverage.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            Manage on GitHub
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border-default bg-bg-surface text-text-primary"
            onClick={onRefresh}
            disabled={isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4", isPending && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
        {refreshError ? (
          <p className="mt-4 text-sm text-state-warning" role="status">
            {refreshError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
