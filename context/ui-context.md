# UI Context

## Product Frame

- **Subject:** an operations workspace for an AI pull-request reviewer.
- **Audience:** repository owners and small engineering teams who need to know
  where DiffGuard is active and whether recent reviews succeeded.
- **Single job:** answer `Where is DiffGuard active, what happened recently,
  and what needs attention?`

The dashboard is read-only. GitHub owns repository permissions; DiffGuard
shows the resulting coverage and provides an explicit `Manage on GitHub`
path.

## Design Direction

Dark only. No light mode. The visual language is a quiet technical workspace:
near-black background, layered work surfaces, precise dividers, restrained
green, and high scanability. It should feel like a security instrument rather
than a generic SaaS analytics template.

The interface spends its visual emphasis on one signature element: the
**coverage rail**. Installation/account groups form the rail and repository
states attach to it, making the App's protection boundary visible. Avoid
decorative stat-card grids, glowing gradients, glass everywhere, oversized
marketing headings, and charts without an operational decision behind them.

## Colors

All components use these CSS custom properties. Do not hardcode hex values in
dashboard components.

| Role            | CSS Variable       | Value     |
| --------------- | ------------------ | --------- |
| Page background | `--bg-base`        | `#0a0a0b` |
| Surface         | `--bg-surface`     | `#141416` |
| Surface raised  | `--bg-raised`      | `#1c1c1f` |
| Primary text    | `--text-primary`   | `#f4f4f5` |
| Muted text      | `--text-muted`     | `#a1a1aa` |
| Primary accent  | `--accent-primary` | `#22c55e` |
| Border          | `--border-default` | `#27272a` |
| Error           | `--state-error`    | `#ef4444` |
| Warning         | `--state-warning`  | `#f59e0b` |
| Success         | `--state-success`  | `#22c55e` |
| Info            | `--state-info`     | `#3b82f6` |

Green means active protection or a successful action. It is not ambient
decoration. Status badge mapping: `completed` → success, `failed` → error,
`running` → info, `queued` → muted, `skipped` → warning. Severity mapping:
critical/high → error, medium → warning, low/info → muted.

## Typography

| Role      | Font       | Variable      |
| --------- | ---------- | ------------- |
| UI text   | Geist Sans | `--font-sans` |
| Code/data | Geist Mono | `--font-mono` |

Repository names, PR numbers, SHAs, durations, installation labels, and
compact operational counts render in mono. Page titles remain modest
(`text-2xl` desktop); the content hierarchy comes from grouping and spacing,
not marketing-scale typography.

## Shape and Density

| Context           | Class        |
| ----------------- | ------------ |
| Inline / badges   | `rounded-md` |
| Cards / panels    | `rounded-lg` |
| Modals / overlays | `rounded-xl` |

Use hairline borders to separate operational regions. Prefer a single panel
with meaningful internal dividers over many floating cards. Rows must remain
comfortable to scan and target with a pointer without becoming oversized.

## Information Architecture

Primary navigation contains only live destinations:

| Label          | Route                     | Job                                      |
| -------------- | ------------------------- | ---------------------------------------- |
| Overview       | `/dashboard`              | Coverage, recent activity, attention     |
| Reviews        | `/dashboard/reviews`      | Full review history and review detail    |
| Repositories   | `/dashboard/repositories` | Installed repositories and GitHub access |

Do not add Settings, Billing, Team, Analytics, or Documentation as inactive
placeholders. Add a destination only when its feature exists.

## Dashboard Shell

Desktop uses a persistent left sidebar, approximately 240px wide, and a
flexible content region. The sidebar contains the DiffGuard mark/wordmark,
primary navigation, then the Clerk user control anchored at the bottom.
The active route uses a quiet raised surface, a slim accent indicator, and
`aria-current="page"`; it does not rely on green text alone.

Mobile replaces the sidebar with a compact sticky top bar and shadcn Sheet.
The top bar contains the mark, current page label, navigation trigger, and
user control. The Sheet repeats the same navigation order and closes after a
selection.

```text
┌────────────────────┬───────────────────────────────────────────────┐
│  Shield  DiffGuard │  Page title                       Page action │
│                    │                                               │
│  Overview          │  Primary operational content                  │
│  Reviews           │                                               │
│  Repositories      │                                               │
│                    │                                               │
│                    │                                               │
│  GitHub user       │                                               │
└────────────────────┴───────────────────────────────────────────────┘
```

Onboarding is intentionally different: before GitHub authorization or the
first installation, keep the existing focused full-width setup panel. Do not
show operational navigation for pages the user cannot use yet.

## Overview

The overview leads with the coverage rail, not generic metric cards.

```text
Repository coverage

● YordanYordanov90                       All repositories · Active
│  ✓ diffguard                           Reviewed 2m ago
│  ○ weather-app                         Awaiting first review
│  ! portfolio                           Latest review failed
│
● example-org                            Selected repositories · Suspended
   ! api                                  Installation suspended

Recent reviews                                      View all reviews →
```

The compact summary may show accessible installations, covered repositories,
reviews today, and repositories needing attention, but these values belong in
the coverage header or one restrained summary strip. No trend charts.

Attention is defined as an installation being suspended, a latest review
being `failed`, or a latest completed review having verdict `concerns`.
`Awaiting first review` is neutral and directed, not an error.

## Reviews

- Full-width data table; a row opens the existing review detail Sheet.
- Columns: repository, PR link, status, findings count, model, duration,
  timestamp.
- Light polling at approximately five seconds plus manual refresh; no
  WebSockets.
- Narrow screens may collapse secondary data into a two-line row, but
  repository, PR, status, findings, and timestamp remain discoverable.
- Failed reviews show a safe error-toned callout in detail. Raw stack traces
  and provider errors never appear.

## Repositories

Group repositories by accessible GitHub installation/account. Each group
header shows account identity, access mode (`All repositories` or
`Selected repositories`), covered count, installation state, and
`Manage on GitHub`.

Repository rows show:

- full repository name;
- coverage state;
- latest review status and timestamp, or `Awaiting first review`;
- `View reviews` and `Open on GitHub` actions.

Search filters the already authorized rows client-side. Stable ordering is:
attention, awaiting first review, then repository name. Do not present custom
selection checkboxes or an in-app `Select all`; GitHub's configuration screen
owns that decision.

`View reviews` may add a repository filter to the reviews route only after
the server confirms that repository belongs to the GitHub-derived
installation allowlist. `Open on GitHub` and `Manage on GitHub` are limited to
the exact `https://github.com` origin.

## State Vocabulary

Use these exact user-facing labels consistently:

| Condition                                  | Label                   |
| ------------------------------------------ | ----------------------- |
| Installation active                       | `Active`                |
| Installation suspended                    | `Suspended`             |
| GitHub selection is all                    | `All repositories`      |
| GitHub selection is selected               | `Selected repositories` |
| Repository has no review                   | `Awaiting first review` |
| Latest review failed                       | `Review failed`         |
| Latest review completed with concerns      | `Needs attention`       |
| Latest review completed without concerns   | `Reviewed`              |

Actions use active, stable language: `Manage on GitHub`, `View all reviews`,
`View reviews`, `Open on GitHub`, `Refresh`, and `Try again`.

Empty states direct the next action:

- No installation: choose repositories on GitHub.
- Installed repositories but no reviews: open a pull request.
- No search results: clear the search or try another repository name.
- Load failure: explain that coverage could not be loaded and offer
  `Try again`; do not expose the underlying error.

## Components

Use shadcn/ui on top of Tailwind. Components live in `components/ui/` and are
added through the CLI, not recreated. Expected primitives: Table, Badge,
Sheet, Button, Skeleton, Tooltip, Separator, Input, and ScrollArea.

Use Lucide React stroke icons only: `h-4 w-4` inline and `h-5 w-5` in
controls. The shield remains the DiffGuard mark. Suggested navigation icons:
LayoutDashboard, GitPullRequest, and FolderGit2. External GitHub actions
include ExternalLink and visible text.

## Interaction, Motion, and Accessibility

- Visible keyboard focus uses the accent ring on every interactive element.
- Every icon-only control has an accessible name and Tooltip where useful.
- Status always has text; never communicate state through color alone.
- Table rows that act as triggers remain keyboard operable without swallowing
  nested GitHub links.
- Meet WCAG AA contrast for text and interactive states.
- Respect `prefers-reduced-motion`.
- Motion is limited to Sheet transitions, brief skeleton-to-content
  replacement, and subtle state changes. No ambient animation or pulsing
  status indicators.
- Verify at 320px, tablet, and wide desktop widths. Long repository names
  truncate visually but remain available through accessible text/tooltip.
