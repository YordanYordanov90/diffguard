import { currentUser } from "@clerk/nextjs/server";

/**
 * Resolve the signed-in user's GitHub login from Clerk's GitHub external
 * account. Used for governance audit attribution — never trusted as tenant scope.
 */
export async function getSignedInGitHubLogin(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  const account = user.externalAccounts.find(
    (entry) =>
      entry.provider === "oauth_github" ||
      entry.provider === "github" ||
      entry.provider.includes("github"),
  );

  const username = account?.username?.trim();
  return username && username.length > 0 ? username : null;
}
