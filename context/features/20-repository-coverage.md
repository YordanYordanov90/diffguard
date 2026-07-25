# Feature 20 — Repository Coverage

## Goal

Show every repository where DiffGuard is installed and give users a secure
path to change repository access on GitHub.

## Depends on

18, 19.

## Scope (do)

- Add `/dashboard/repositories` with repositories grouped by accessible
  GitHub installation/account.
- Consume Feature 19's validated installation descriptors and shared
  tenant-scoped repository/latest-review read model.
- For each installation, show:
  - account login and account type;
  - `All repositories` or `Selected repositories`;
  - covered repository count;
  - suspended/active state;
  - `Manage on GitHub` using GitHub's validated installation `html_url`.
- For each repository, show full name, coverage state, latest review status
  and time, and actions to view its reviews or open it on GitHub.
- `View reviews` uses a repository filter on `/dashboard/reviews`; the server
  applies it only after confirming the repository belongs to the
  GitHub-derived installation allowlist.
- Provide client-side search over the already authorized result and stable
  sorting: attention first, then awaiting-first-review, then repository name.
- GitHub remains the only place where a user selects `All repositories` or
  changes the selected set. DiffGuard reflects webhook/GitHub state and never
  attempts to grant itself access.
- External repository and installation links must be constructed or validated
  as `https://github.com` destinations only.
- After the user returns from GitHub, a manual refresh must bypass or
  invalidate the short installation-access cache so updated selection mode
  and coverage are visible promptly.

## Out of scope

Custom repository checkboxes, in-app add/remove API calls, per-repository
enable toggles, model/strictness configuration, bulk mutations, or schema
migrations.

## Verification

- `all` and `selected` installations render the correct access label and
  configuration link.
- Repository rows are limited to GitHub-derived accessible installations;
  a user cannot request another installation through URL or client state.
- Added/removed repository webhook fixtures appear/disappear after refresh.
- Search, sorting, empty states, GitHub links, mobile layout, and keyboard
  navigation work without exposing tokens or raw API errors.
