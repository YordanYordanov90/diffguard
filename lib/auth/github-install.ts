import { z } from "zod";

const appSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/)
  .default("diffguard-dev");

export function githubAppInstallUrl() {
  const slug = appSlugSchema.parse(process.env.GITHUB_APP_SLUG);
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}
