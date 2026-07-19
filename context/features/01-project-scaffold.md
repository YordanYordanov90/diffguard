# Feature 01 — Project Scaffold

## Goal
An empty but correctly structured Next.js app that builds and deploys.

## Depends on
00.

## Scope (do)
- Next.js (App Router) + TypeScript strict + Tailwind v4 (`@theme` in
  `globals.css`, no tailwind.config.ts) + shadcn/ui init.
- Install deps: drizzle-orm, drizzle-kit, @neondatabase/serverless, zod,
  ai (Vercel AI SDK) + provider packages, @upstash/qstash, @upstash/ratelimit,
  @upstash/redis, @clerk/nextjs, octokit, vitest.
- Create empty folder structure per `context/code-standards.md`
  (File Organization section) with placeholder index files.
- Vitest config; `npm run build` and `npm run test` scripts work.
- Deploy to the dev Vercel project.

## Out of scope
Any schema, route logic, env validation, or UI beyond the default page.

## Verification
`npm run build` passes locally and the dev deployment serves the default page.
