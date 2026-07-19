# Feature 00 — GitHub App & Environment Setup (manual ops, no code)

## Goal

Both environments exist and hold their secrets before any code runs.

## Depends on

Nothing.

## Scope (do)

- Register GitHub App `diffguard-dev` (fallback name if taken):
Permissions: Pull requests RW, Contents RO, Metadata RO.
Events: pull_request, installation, installation_repositories.
Webhook URL: dev Vercel deployment `/api/webhooks/github`. Set webhook secret.
- Generate private key; base64-encode; store in dev Vercel project env.
- Register prod app `DiffGuard` the same way with a SEPARATE private key
and webhook secret (prod Vercel project).
- Create Neon project with `dev` branch; two Vercel projects (dev, prod)
pointed at the same repo, different envs.
- Create Upstash QStash + Redis; store keys per environment.
- Create a scratch GitHub repo for testing; install ONLY the dev app on it.
- Create Clerk application with GitHub as the only OAuth provider.



## Out of scope

Any application code. Installing the prod app on real repos (Feature 15 gate).

## Verification

- Dev app appears in GitHub settings with correct permissions/events.
- All env vars present in both Vercel projects; keys differ between envs.

