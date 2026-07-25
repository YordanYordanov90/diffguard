import Link from "next/link";
import { ArrowRight, FolderGit2, GitPullRequest } from "lucide-react";

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
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-primary">
          Workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Overview
        </h1>
        <p className="max-w-xl text-sm text-text-muted">
          Where DiffGuard is active, what happened recently, and what needs
          attention.
        </p>
      </div>
      <Link
        href="/dashboard/reviews"
        className="inline-flex items-center gap-2 self-start rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-raised focus-visible:ring-2 focus-visible:ring-accent-primary sm:self-auto"
      >
        View all reviews
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function EmptyRepositories({ installUrl }: { installUrl: string }) {
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
          repositories on GitHub to start protecting pull requests.
        </p>
        <a
          href={installUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2 text-sm text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          Manage on GitHub
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </section>
  );
}

function RecentReviewsSection({ data }: { data: OverviewModel }) {
  const hasRepos = data.summary.repositoryCount > 0;
  const hasReviews = data.recentReviews.length > 0;

  return (
    <section aria-labelledby="recent-reviews-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="recent-reviews-heading"
            className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted"
          >
            Recent reviews
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Latest activity across accessible installations.
          </p>
        </div>
        <Link
          href="/dashboard/reviews"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          View all reviews
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {hasReviews ? (
        <ReviewsTable reviews={data.recentReviews} />
      ) : hasRepos ? (
        <section className="rounded-lg border border-border-default bg-bg-surface p-8 sm:p-12">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-default bg-bg-raised">
              <GitPullRequest
                className="h-5 w-5 text-accent-primary"
                aria-hidden
              />
            </span>
            <h3 className="text-lg font-medium text-text-primary">
              Open a pull request
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Repositories are covered. Open or update a pull request to trigger
              the first DiffGuard review.
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
