# Feature 21 — Dashboard UI Refinement

## Goal

Refine the completed dashboard into a distinctive, high-scanability security
operations workspace inspired by Signal's dark DevOps clarity while preserving
DiffGuard's own coverage-first identity.

## Depends on

17, 18, 19, 20.

## Design thesis

DiffGuard is a protection console, not a generic analytics dashboard. The
interface should feel calm when coverage is healthy and make exceptions easy
to find when a review or installation needs attention.

Signal is a reference for near-black surfaces, compact operational density,
precise dividers, and status-led hierarchy. Do not copy its terminal styling,
neon-green treatment, chart-heavy overview, large navigation inventory, or
infrastructure vocabulary.

The signature element remains DiffGuard's **coverage rail**. Strengthen it
into a visible protection boundary connecting each GitHub installation to its
covered repositories.

## Scope (do)

### Shared shell

- Keep the existing desktop sidebar and mobile Sheet navigation.
- Refine the desktop active route to use a slim left accent rail, quiet raised
  background, icon, and text. Remove the trailing decorative status dot.
- Keep the sidebar compact and calm: no new navigation destinations, nested
  menus, search, notifications, theme switcher, or decorative status counters.
- Preserve the DiffGuard shield, wordmark, Clerk user control, responsive
  behavior, and focused onboarding shell.
- Use the page background, surface, raised surface, and borders to create
  depth. Green remains semantic rather than ambient.

### Overview header and protection summary

- Keep the modest page title and short operational description.
- Replace the current four-cell stat-card-like grid with one compact
  **Protection summary** strip.
- The strip may show only the existing derived values:
  accessible installations, covered repositories, reviews today, and
  repositories needing attention.
- Treat `Need attention` as the exception value. Healthy totals remain neutral;
  green is not applied to every number.
- Keep one `View all reviews` action on the page. Remove the duplicate action
  from either the page header or recent-reviews heading.
- Do not introduce an aggregate health label unless it is derived from the
  existing attention and suspension rules in `ui-context.md`.

### Coverage rail

- Make each installation the start of a continuous rail segment and attach its
  repository rows with visible connectors.
- Use a clear installation node, account login, access mode, installation
  state, and repository count in one scan line.
- Align repository names and latest-review details into stable columns on
  desktop. Preserve the exact state vocabulary from `ui-context.md`.
- Keep healthy, awaiting, and attention markers visually distinct through icon
  or symbol, text, and semantic color; never color alone.
- Use a subtle raised row or border change on hover/focus. Do not turn every
  repository into a floating card.
- On narrow screens, keep the rail vertical and stack the latest-review detail
  below the repository name without breaking the installation relationship.

### Recent reviews

- Keep the existing table data, polling, refresh behavior, detail Sheet, and
  GitHub links.
- Tighten the visual rhythm to match the coverage panel: consistent header
  treatment, borders, row heights, mono data, status badges, and hover/focus
  states.
- Keep repository, pull request, status, findings, and timestamp discoverable
  on narrow screens. Secondary model and duration data may remain collapsed.
- Do not add charts, sparklines, trend percentages, avatars, or activity
  decoration.

### Reviews and repositories pages

- Apply the same panel headers, row density, divider treatment, status
  semantics, focus states, and responsive rhythm used by the refined overview.
- Preserve all existing filters, search, refresh, detail, and external-link
  behavior.
- Repository installation groups should visually match the overview rail so
  users learn one coverage model across both pages.

### States and polish

- Refine loading skeletons to match the final panel geometry and avoid layout
  shift.
- Keep empty and error states directional and compact. Do not use large
  illustrations or marketing copy.
- Preserve visible keyboard focus, WCAG AA contrast, text labels for every
  status, `prefers-reduced-motion`, and long-name tooltips or accessible text.
- Verify the final design at 320px, tablet, standard desktop, and wide desktop.

## Visual contract

```text
┌──────────────────┬──────────────────────────────────────────────────┐
│ Shield DiffGuard │ Overview                          GitHub account │
│                  ├──────────────────────────────────────────────────┤
│ Overview         │ Protection summary                               │
│ Reviews          │ 2 installs · 14 repos · 6 today · Need attention 1 │
│ Repositories     ├──────────────────────────────────────────────────┤
│                  │ Repository coverage                              │
│                  │                                                  │
│                  │ ● account                All repositories · Active│
│                  │ │ ✓ owner/repository     Reviewed 2m ago         │
│                  │ │ ○ owner/new-repo       Awaiting first review   │
│                  │ └ ! owner/api            Review failed           │
│                  ├──────────────────────────────────────────────────┤
│ GitHub account   │ Recent reviews                        View all → │
└──────────────────┴──────────────────────────────────────────────────┘
```

## Out of scope

New database fields, queries, API routes, status enums, persisted aggregates,
charts, historical analytics, usage or billing UI, settings, repository
permission mutations, light mode, new fonts, new navigation destinations, or
pipeline behavior changes.

## Implementation notes

- Reuse the existing DiffGuard CSS variables, Geist Sans, Geist Mono, Lucide
  icons, and shadcn/ui primitives.
- Prefer modifying the existing dashboard components over introducing a new
  parallel component system.
- Keep server/client boundaries unchanged unless a visual interaction strictly
  requires client state.
- No changes to tenant isolation, GitHub-derived installation access, link
  validation, polling, or review-detail behavior.

## Verification

- Existing dashboard unit tests remain green.
- `npm run lint`, `npm test`, and `npm run build` pass.
- Overview, reviews, repositories, onboarding, loading, empty, healthy,
  suspended, running, failed, and attention states are visually checked.
- Keyboard navigation reaches every action in a sensible order with visible
  focus.
- Status remains understandable in grayscale and without motion.
- Screenshots are reviewed at 320px, tablet, standard desktop, and wide
  desktop before the feature is marked complete.
