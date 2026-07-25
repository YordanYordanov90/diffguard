import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { ReviewsTable } from "@/components/dashboard/reviews-table";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardReviews } from "@/lib/dashboard/reviews";

export async function ReviewsPage() {
  const dashboard = await getDashboardReviews();

  if (dashboard.status === "github-authorization-required") {
    return <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />;
  }

  if (dashboard.installationIds.length === 0) {
    return <GitHubOnboarding stage="install" installUrl={githubAppInstallUrl()} />;
  }

  return (
    <div className="space-y-6">
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

      <ReviewsTable reviews={dashboard.reviews} />
    </div>
  );
}
