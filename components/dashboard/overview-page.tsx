import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { ReviewsTable } from "@/components/dashboard/reviews-table";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardReviews } from "@/lib/dashboard/reviews";

export async function OverviewPage() {
  const dashboard = await getDashboardReviews(5);

  if (dashboard.status === "github-authorization-required") {
    return <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />;
  }

  if (dashboard.installationIds.length === 0) {
    return <GitHubOnboarding stage="install" installUrl={githubAppInstallUrl()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-primary">
            Workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Overview
          </h1>
          <p className="max-w-xl text-sm text-text-muted">
            A quick view of recent review activity across the installations
            your GitHub account can access.
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

      <section className="rounded-lg border border-border-default bg-bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted">
              Recent review activity
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
              {dashboard.reviews.length}
            </p>
          </div>
          <p className="max-w-[12rem] text-right text-xs leading-5 text-text-muted">
            Showing the latest reviews. Coverage details arrive with the
            repository workspace.
          </p>
        </div>
      </section>

      <ReviewsTable reviews={dashboard.reviews} />
    </div>
  );
}
