# Feature 18 — Dashboard Shell & Navigation

## Goal

Turn the completed single-page dashboard into a responsive operations
workspace with stable navigation and clear page hierarchy.

## Depends on

16, 17.

## Scope (do)

- Replace the current top-navbar / single-column shell with:
  - a persistent left sidebar on desktop;
  - a compact top bar and shadcn Sheet navigation on mobile;
  - a flexible main content area with a readable maximum width.
- Primary navigation contains only implemented destinations in this
  increment: `Overview` and `Reviews`. Feature 20 adds `Repositories` only
  once its route exists.
- Routes:
  - `/dashboard` → overview;
  - `/dashboard/reviews` → the existing Feature 17 reviews experience;
  - `/dashboard/repositories` is introduced by Feature 20 and is not linked
    before that feature is implemented.
- Keep the shield mark and DiffGuard wordmark at the top. Keep the Clerk
  user control anchored at the bottom of the desktop sidebar and in the
  mobile top bar.
- Use pathname-derived active states, visible keyboard focus, semantic
  navigation labels, and icon + text labels. Icons never carry meaning alone.
- Preserve the Feature 16 onboarding panel as a focused full-width state.
  Do not show operational navigation until GitHub is authorized and at
  least one accessible installation exists.
- The shell is an RSC by default. Isolate only pathname/mobile-menu behavior
  in the smallest necessary client component.

## Out of scope

New dashboard data, settings, billing, documentation pages, pipeline changes,
or repository permission mutations. Do not render disabled placeholder links.

## Verification

- Desktop navigation remains visible while page content scrolls.
- Mobile navigation opens and closes from a keyboard-accessible control,
  closes after route selection, and does not trap focus after dismissal.
- Direct navigation and refresh preserve the correct active destination.
- Existing onboarding and review-detail flows still work.
- Reduced-motion, keyboard, 320px mobile, tablet, and desktop checks pass.
