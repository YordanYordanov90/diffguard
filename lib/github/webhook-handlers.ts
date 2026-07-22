import type {
  InstallationEvent,
  InstallationRepositoriesEvent,
} from "./events";

export async function handleInstallation(
  event: InstallationEvent,
) {
  const {
    deleteInstallation,
    suspendInstallation,
    syncRepositories,
    upsertInstallation,
  } = await import("@/lib/db/queries");
  const installationId = event.installation.id;

  switch (event.action) {
    case "created":
      await upsertInstallation({
        id: installationId,
        accountLogin: event.installation.account.login,
        accountType: event.installation.account.type,
      });
      await syncRepositories(
        installationId,
        (event.repositories ?? []).map(toRepositoryInput),
        [],
      );
      return;
    case "deleted":
      await deleteInstallation(installationId);
      return;
    case "suspend":
      await suspendInstallation(installationId, true);
      return;
    case "unsuspend":
      await suspendInstallation(installationId, false);
      return;
    default:
      return;
  }
}

export async function handleInstallationRepos(
  event: InstallationRepositoriesEvent,
) {
  const { syncRepositories } = await import("@/lib/db/queries");
  await syncRepositories(
    event.installation.id,
    event.repositories_added.map(toRepositoryInput),
    event.repositories_removed.map(toRepositoryInput),
  );
}

function toRepositoryInput(repository: { id: number; full_name: string }) {
  return { id: repository.id, fullName: repository.full_name };
}
