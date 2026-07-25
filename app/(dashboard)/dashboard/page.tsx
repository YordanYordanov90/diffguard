import { GitPullRequest, Shield } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Reviews
        </h1>
        <p className="text-sm text-text-muted">
          Read-only history for installations your GitHub account can access.
        </p>
      </div>

      <section className="rounded-lg border border-border-default bg-bg-surface p-8 sm:p-12">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-default bg-bg-raised">
            <GitPullRequest
              className="h-5 w-5 text-accent-primary"
              aria-hidden
            />
          </span>
          <h2 className="text-lg font-medium text-text-primary">
            No reviews yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Once DiffGuard reviews a pull request on an installation you can
            access, it will appear here. The full reviews table arrives with the
            next UI feature.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2 text-xs text-text-muted">
            <Shield className="h-3.5 w-3.5 text-accent-primary" aria-hidden />
            <span>
              Install the GitHub App on a repository to start collecting reviews.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
