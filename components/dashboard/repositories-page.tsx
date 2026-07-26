import { GitHubOnboarding } from "@/components/dashboard/github-onboarding";
import { LoadError } from "@/components/dashboard/load-error";
import { RepositoriesInventory } from "@/components/dashboard/repositories-inventory";
import { githubAppInstallUrl } from "@/lib/auth/github-install";
import { getDashboardRepositories } from "@/lib/dashboard/repositories";

export async function RepositoriesPage() {
  const result = await getDashboardRepositories();

  if (result.status === "github-authorization-required") {
    return (
      <GitHubOnboarding stage="connect" installUrl={githubAppInstallUrl()} />
    );
  }

  if (result.status === "error") {
    return (
      <div className="space-y-6">
        <RepositoriesHeader />
        <LoadError />
      </div>
    );
  }

  if (result.groups.length === 0) {
    return (
      <GitHubOnboarding stage="install" installUrl={githubAppInstallUrl()} />
    );
  }

  return (
    <div className="space-y-6">
      <RepositoriesHeader />
      <RepositoriesInventory
        groups={result.groups}
        installUrl={githubAppInstallUrl()}
      />
    </div>
  );
}

function RepositoriesHeader() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        Repositories
      </h1>
      <p className="max-w-2xl text-sm text-text-muted">
        Every repository where DiffGuard is installed. Change access on GitHub;
        DiffGuard never grants itself repository permissions.
      </p>
    </div>
  );
}
