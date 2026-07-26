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

import { CoverageRail } from "@/components/dashboard/coverage-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshDashboardCoverage } from "@/lib/dashboard/actions";
import { filterCoverageGroups } from "@/lib/dashboard/coverage";
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

const actionLinkClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary";

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
          <p className="font-mono text-xs tabular-nums text-text-muted">
            {hasQuery
              ? `${visibleRepos} of ${totalRepos}`
              : `${totalRepos} ${totalRepos === 1 ? "repository" : "repositories"}`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-border-default bg-bg-surface text-text-primary hover:bg-bg-raised"
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
        <section className="rounded-lg border border-border-default bg-bg-surface px-5 py-8">
          <h2 className="text-sm font-medium text-text-primary">
            No matching repositories
          </h2>
          <p className="mt-1 text-sm text-text-muted">
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
        <CoverageRail
          groups={filtered}
          renderGroupAction={(group) => (
            <a
              href={group.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(actionLinkClass, "self-start sm:self-auto")}
            >
              Manage on GitHub
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          renderActions={(repo) => {
            const openUrl = githubRepoUrl(repo.fullName);
            return (
              <>
                <Link
                  href={reviewsFilterHref(repo.fullName)}
                  className={actionLinkClass}
                >
                  View reviews
                </Link>
                {openUrl ? (
                  <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={actionLinkClass}
                  >
                    Open on GitHub
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </>
            );
          }}
        />
      )}
    </div>
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
    <section className="rounded-lg border border-border-default bg-bg-surface px-5 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-raised">
          <FolderGit2 className="h-4 w-4 text-text-muted" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-sm font-medium text-text-primary">
              Choose repositories on GitHub
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              DiffGuard is installed, but no repositories are covered yet.
              Select repositories on GitHub, then refresh to see updated
              coverage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLinkClass}
            >
              Manage on GitHub
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
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
            <p className="text-sm text-state-warning" role="status">
              {refreshError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
