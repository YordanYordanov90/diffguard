import Link from "next/link";
import { ArrowRight, ExternalLink, FolderGit2, GitPullRequest } from "lucide-react";

import { CoverageRail } from "@/components/dashboard/coverage-rail";
import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { LoadError } from "@/components/dashboard/load-error";
import { OverviewSummaryStrip } from "@/components/dashboard/overview-summary";
import { ReviewsTable } from "@/components/dashboard/reviews-table";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import type { OverviewModel } from "@/lib/dashboard/types";

export async function OverviewPage() {
  const overview = await getDashboardOverview();

  if (overview.status === "github-authorization-required") {
    return (
      <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />
    );
  }

  if (overview.status === "error") {
    return (
      <div className="space-y-6">
        <OverviewHeader />
        <LoadError />
      </div>
    );
  }

  const { data } = overview;

  if (data.summary.installationCount === 0) {
    return (
      <GitHubOnboarding stage="install" installUrl={githubAppInstallUrl()} />
    );
  }

  return (
    <div className="space-y-6">
      <OverviewHeader />
      <OverviewSummaryStrip summary={data.summary} />

      {data.summary.repositoryCount === 0 ? (
        <EmptyRepositories installUrl={githubAppInstallUrl()} />
      ) : (
        <CoverageRail groups={data.groups} />
      )}

      <RecentReviewsSection data={data} />
    </div>
  );
}

function OverviewHeader() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        Overview
      </h1>
      <p className="max-w-xl text-sm text-text-muted">
        Where DiffGuard is active, what happened recently, and what needs
        attention.
      </p>
    </div>
  );
}

function EmptyRepositories({ installUrl }: { installUrl: string }) {
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
              Select repositories on GitHub to start protecting pull requests.
            </p>
          </div>
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            Manage on GitHub
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

function RecentReviewsSection({ data }: { data: OverviewModel }) {
  const hasRepos = data.summary.repositoryCount > 0;
  const hasReviews = data.recentReviews.length > 0;

  return (
    <section
      aria-labelledby="recent-reviews-heading"
      className="overflow-hidden rounded-lg border border-border-default bg-bg-surface"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border-default px-4 py-3 sm:px-5">
        <h2
          id="recent-reviews-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
        >
          Recent reviews
        </h2>
        <Link
          href="/dashboard/reviews"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-text-primary outline-none transition-colors hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          View all reviews
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {hasReviews ? (
        <div className="p-0">
          <ReviewsTable reviews={data.recentReviews} embedded />
        </div>
      ) : hasRepos ? (
        <div className="px-5 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-raised">
              <GitPullRequest className="h-4 w-4 text-text-muted" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                Open a pull request
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                Repositories are covered. Open or update a pull request to
                trigger the first DiffGuard review.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
