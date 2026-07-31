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

### Signal-inspired refinement

Signal's DevOps dashboard is a visual reference for operational density,
near-black surfaces, precise dividers, and status-led scanability. It is not a
template to copy. DiffGuard keeps its own Geist typography, restrained color
semantics, small navigation inventory, GitHub vocabulary, and coverage-first
information architecture.

Do not adopt terminal prompts, neon-green decoration, green-tinted panels,
chart-heavy layouts, oversized infrastructure menus, or ambient glow. The
Signal influence should be visible in clarity and rhythm, not imitation.

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

In-progress status treatment keeps the text label visible at all times:
`queued` uses a static clock icon; `running` may use a `motion-safe`
spinner to communicate active processing and becomes static when reduced
motion is preferred.

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
Use raised surfaces selectively for active navigation, focused rows, and
temporary overlays rather than as the default treatment for every region.

## Information Architecture

Primary navigation contains only live destinations:

| Label          | Route                     | Job                                      |
| -------------- | ------------------------- | ---------------------------------------- |
| Overview       | `/dashboard`              | Coverage, recent activity, attention     |
| Reviews        | `/dashboard/reviews`      | Full review history and review detail    |
| Repositories   | `/dashboard/repositories` | Installed repositories and GitHub access |
| Learnings      | `/dashboard/learnings`    | Govern repository preferences (Feature 32) |

Do not add Settings, Billing, Team, Analytics, or Documentation as inactive
placeholders. Add a destination only when its feature exists.

## Dashboard Shell

Desktop uses a persistent left sidebar, approximately 240px wide, and a
flexible content region. The sidebar contains the DiffGuard mark/wordmark,
primary navigation, then the Clerk user control anchored at the bottom.
The active route uses a quiet raised surface, a slim accent indicator, and
`aria-current="page"`; it does not rely on green text alone. The accent
indicator is a slim left rail, not a trailing status dot. Do not add inactive
destinations, nested navigation, global search, notifications, or a theme
switcher for visual fullness.

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
│  Learnings         │                                               │
│                    │                                               │
│  GitHub user       │                                               │
└────────────────────┴───────────────────────────────────────────────┘
```

## Learnings (Feature 32)

Operational governance for explicit repository preferences. Grouped list with
repository filter, status filter, and text search. Each row shows preference
text as plain text (never HTML), status, creator, usage, last change audit, and
source PR when known. Edit, archive, and reactivate use Server Actions with a
confirmation step for status changes. Mutations re-check GitHub write/maintain/
admin permission; dashboard visibility alone is not enough.


Onboarding is intentionally different: before GitHub authorization or the
first installation, keep the existing focused full-width setup panel. Do not
show operational navigation for pages the user cannot use yet.

## Overview

The overview leads with one compact **Protection summary** followed by the
coverage rail, not generic metric cards. The summary is a single operational
strip with internal dividers; it does not render as four floating cards.

```text
Protection summary
2 installations · 14 repositories · 6 reviews today · 1 needs attention

Repository coverage

● YordanYordanov90                       All repositories · Active
│  ✓ YordanYordanov90/diffguard          Reviewed 2m ago
│  ○ YordanYordanov90/weather-app        Awaiting first review
│  ! YordanYordanov90/portfolio          Review failed
│
● example-org                            Selected repositories · Suspended
   ! api                                  Installation suspended

Recent reviews                                      View all reviews →
```

The summary may show only accessible installations, covered repositories,
reviews today, and repositories needing attention. Healthy values remain
neutral; the attention value uses warning emphasis only when non-zero. Do not
invent percentages, trends, or an aggregate health label without a defined
derivation. No trend charts.

The coverage rail is a real structural device rather than a decorative left
border:

- each installation starts a continuous rail segment with a visible node;
- repository rows attach to that segment with connectors;
- desktop rows align repository identity and latest-review detail into stable
  columns;
- mobile rows keep the rail and stack the detail below the repository name;
- hover and focus use a subtle surface or border change, not a floating card;
- markers combine symbol or icon, text, and semantic color.

Keep exactly one `View all reviews` action on the overview.

Attention is defined as an installation being suspended, a latest review
being `failed`, or a latest completed review having verdict `concerns`.
`Awaiting first review` is neutral and directed, not an error.

## Reviews

- Full-width data table; a row opens the existing review detail Sheet.
- Table and panel headers use the same compact hierarchy, dividers, and density
  as the coverage rail.
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

Installation headers, rail connectors, repository markers, panel borders, and
row rhythm match the overview coverage rail so both pages teach the same
protection model.

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
  replacement, subtle state changes, and a motion-safe spinner for an actively
  `running` review. Do not animate queued status or use pulsing indicators.
- Verify at 320px, tablet, and wide desktop widths. Long repository names
  truncate visually but remain available through accessible text/tooltip.
- Loading skeletons mirror the final panel geometry closely enough to avoid
  visible layout shift.
