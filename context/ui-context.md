# UI Context

## Theme

Dark only. No light mode. Dark technical workspace in the style of the
owner's other tools (Cod3mate dashboard): near-black backgrounds, layered
surfaces, one vivid accent, generous whitespace. The dashboard is a
read-only operations view — density and scanability over decoration.

## Colors

All components use these tokens as CSS custom properties — no hardcoded
hex values in components.

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

Status badge mapping: `completed` → success, `failed` → error,
`running` → info, `queued` → muted, `skipped` → warning.
Severity mapping: critical/high → error, medium → warning,
low/info → muted.

## Typography

| Role      | Font       | Variable      |
| --------- | ---------- | ------------- |
| UI text   | Geist Sans | `--font-sans` |
| Code/mono | Geist Mono | `--font-mono` |

PR numbers, SHAs, repo names, and durations render in mono.

## Border Radius

| Context           | Class        |
| ----------------- | ------------ |
| Inline / badges   | `rounded-md` |
| Cards / panels    | `rounded-lg` |
| Modals / overlays | `rounded-xl` |

## Component Library

shadcn/ui on top of Tailwind. Components live in `components/ui/` and
are added via the CLI, not written from scratch. Key components:
data table (reviews list), badge (status/severity), sheet or dialog
(review detail), skeleton (loading).

## Layout Patterns

- Dashboard: top navbar (logo, Clerk user button) + single content
  column, max-width container.
- Reviews table: full-width data table; row click opens the detail view.
- Detail view: rendered review markdown in a scrollable panel; failed
  reviews show the error text in an error-toned callout.
- Freshness: light polling (~5s) or a manual refresh button — no
  websockets.

## Icons

Lucide React, stroke-based only. `h-4 w-4` inline, `h-5 w-5` in buttons.
Shield icon as the DiffGuard mark.
