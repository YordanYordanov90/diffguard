import { z } from "zod";

/**
 * Validated shape of GitHub `GET /user/installations` items before they enter
 * the dashboard read model (`schemas.md` — Dashboard GitHub Access Contract).
 */
export function isGitHubHtmlUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com";
  } catch {
    return false;
  }
}

export const accessibleInstallationSchema = z.object({
  id: z.number().int().positive(),
  account: z.object({
    login: z.string().min(1),
    type: z.string().min(1),
  }),
  repository_selection: z.enum(["all", "selected"]),
  html_url: z
    .string()
    .min(1)
    .refine(isGitHubHtmlUrl, "html_url must use https://github.com"),
  suspended_at: z.string().nullable(),
});

export const accessibleInstallationsSchema = z.array(accessibleInstallationSchema);

export type AccessibleInstallation = z.infer<typeof accessibleInstallationSchema>;

/** Reduce a raw GitHub installation object to the dashboard contract. */
export function parseAccessibleInstallation(
  raw: unknown,
): AccessibleInstallation | null {
  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const account =
    typeof record.account === "object" && record.account !== null
      ? (record.account as Record<string, unknown>)
      : null;

  const candidate = {
    id: record.id,
    account: account
      ? {
          login: account.login,
          type: account.type,
        }
      : undefined,
    repository_selection: record.repository_selection,
    html_url: record.html_url,
    suspended_at:
      record.suspended_at === undefined ? null : record.suspended_at,
  };

  const parsed = accessibleInstallationSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function parseAccessibleInstallations(
  raw: unknown[],
): AccessibleInstallation[] {
  return raw
    .map(parseAccessibleInstallation)
    .filter((item): item is AccessibleInstallation => item !== null);
}
