# Feature 00 — GitHub App & Environment Setup (manual ops, no code)

## Goal

The environment exists and holds its secrets before any code runs.

## Depends on

Nothing.

## Scope (do)

- Register GitHub App `diffguard-dev` (fallback name if taken):
Permissions: Pull requests RW, Contents RO, Metadata RO.
Events: pull_request (installation, installation_repositories are
delivered automatically, no explicit subscription). Webhook URL: the
Vercel deployment's `/api/webhooks/github`. Set webhook secret.
— DONE 2026-07-19.
- Generate private key; base64-encode; store in the Vercel project env.
- Single GitHub App only — no separate prod app. Promote to real repos
by installing this same app on them and updating env vars/secrets in
place (Feature 15 gate), not by registering a second app.
- Create Neon project (single database, no dev/prod branch split);
one Vercel project pointed at the repo.
- Create Upstash QStash + Redis; store keys in the Vercel project env.
- Create a scratch GitHub repo for testing; install the app on it first
to verify end-to-end before installing on real repos.
- Create Clerk application with GitHub as the only OAuth provider.
- Enable the GitHub App web application flow and configure its client ID,
  client secret, and exact OAuth callback URL for the dashboard authorization
  route. Generate a 32-byte encryption key for storing OAuth tokens in Redis.



## Out of scope

Any application code. Installing the app on real repos (Feature 15 gate).

## Verification

- App appears in GitHub settings with correct permissions/events.
- All env vars present in the Vercel project.
