import Link from "next/link";
import { X } from "lucide-react";

import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { LoadError } from "@/components/dashboard/load-error";
import { ReviewsTable } from "@/components/dashboard/reviews-table";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardReviews } from "@/lib/dashboard/reviews";

type ReviewsPageProps = {
  repositoryFullName?: string | null;
};

export async function ReviewsPage({
  repositoryFullName = null,
}: ReviewsPageProps) {
  const dashboard = await getDashboardReviews({
    repositoryFullName,
  });

  if (dashboard.status === "github-authorization-required") {
    return (
      <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />
    );
  }

  if (dashboard.status === "error") {
    return (
      <div className="space-y-6">
        <ReviewsHeader />
        <LoadError
          title="Reviews could not be loaded"
          description="Something went wrong while loading review history. Try again in a moment."
        />
      </div>
    );
  }

  if (dashboard.installationIds.length === 0) {
    return (
      <GitHubOnboarding stage="install" installUrl={githubAppInstallUrl()} />
    );
  }

  return (
    <div className="space-y-6">
      <ReviewsHeader />
      {dashboard.repositoryFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-4 py-3">
          <p className="text-sm text-text-muted">
            Filtered to{" "}
            <span className="font-mono text-text-primary">
              {dashboard.repositoryFilter}
            </span>
          </p>
          <Link
            href="/dashboard/reviews"
            className="inline-flex items-center gap-1 rounded-md border border-border-default bg-bg-raised px-2 py-1 text-xs text-text-primary outline-none transition-colors hover:bg-bg-raised/80 focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            Clear filter
            <X className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : null}
      <ReviewsTable reviews={dashboard.reviews} />
    </div>
  );
}

function ReviewsHeader() {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-primary">
        Review activity
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        Reviews
      </h1>
      <p className="text-sm text-text-muted">
        Read-only history for installations your GitHub account can access.
      </p>
    </div>
  );
}
