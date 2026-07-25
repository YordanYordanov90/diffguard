import { parseEnv } from "@/lib/config/env";
import { handleGitHubWebhook } from "@/lib/webhooks/github";

export async function POST(request: Request) {
  const { GITHUB_WEBHOOK_SECRET: webhookSecret } = parseEnv();
  return handleGitHubWebhook(request, webhookSecret);
}
