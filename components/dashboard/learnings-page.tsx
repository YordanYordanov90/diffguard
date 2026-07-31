import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { LoadError } from "@/components/dashboard/load-error";
import { LearningsInventory } from "@/components/dashboard/learnings-inventory";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardLearnings } from "@/lib/dashboard/learnings-data";

export async function LearningsPage() {
  const result = await getDashboardLearnings();

  if (result.status === "github-authorization-required") {
    return (
      <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />
    );
  }

  if (result.status === "error") {
    return (
      <div className="space-y-6">
        <LearningsHeader />
        <LoadError />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LearningsHeader />
      <LearningsInventory
        learnings={result.learnings}
        repositories={result.repositories}
      />
    </div>
  );
}

function LearningsHeader() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        Learnings
      </h1>
      <p className="max-w-2xl text-sm text-text-muted">
        Repository preferences saved by collaborators. Active learnings inform
        future reviews; archived ones do not. Security rules always outrank
        learnings.
      </p>
    </div>
  );
}
