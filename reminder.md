# Security Dependency Reminder

Review before production launch:

- `esbuild` moderate advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
  - Affected dependency entries: `esbuild`, `@esbuild-kit/core-utils`,
    `@esbuild-kit/esm-loader`, and `drizzle-kit`.
  - Impact: a malicious website may send requests to a local esbuild
    development server and read responses.
  - Scope: development/build tooling; not production runtime code.
- `postcss` moderate advisory: [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
  - Affected dependency entries: `postcss` and the installed `next` dependency.
  - Impact: possible XSS through unescaped `</style>` output.

## Follow-up

- Re-run `npm audit` after compatible Drizzle Kit and Next.js updates are available.
- Prefer targeted dependency updates and verify `npm run lint`, `npm test`, and
  `npm run build` afterward.
- Do not run `npm audit fix --force`; the current audit suggestion downgrades
  core packages to obsolete, incompatible versions.
