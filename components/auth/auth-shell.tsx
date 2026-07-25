import { Shield } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-0 sm:p-6 lg:p-10">
      <div className="relative grid h-svh w-full max-w-[1424px] overflow-hidden bg-bg-base sm:h-[min(950px,calc(100svh-3rem))] sm:rounded-2xl sm:border sm:border-border-default lg:grid-cols-2">
        {/* Left — atmospheric brand panel */}
        <aside className="relative hidden overflow-hidden lg:flex lg:flex-col">
          {/* Soft light bloom (Sphere-style) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-1/4 -top-1/4 h-[70%] w-[90%] rounded-full bg-accent-primary/15 blur-[100px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,color-mix(in_srgb,var(--accent-primary)_18%,transparent),transparent_55%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_90%,color-mix(in_srgb,var(--bg-raised)_80%,transparent),transparent_50%)]"
          />

          <div className="relative z-10 flex flex-1 flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center gap-2.5 opacity-80">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default/80 bg-bg-surface/60 backdrop-blur-sm">
                <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
              </span>
              <span className="text-sm font-medium tracking-tight text-text-primary">
                DiffGuard
              </span>
            </div>

            <div className="max-w-xl space-y-6">
              <h1 className="auth-headline text-[clamp(3.4rem,5.2vw,5.7rem)] font-bold leading-[0.94] tracking-[-0.065em]">
                LET&apos;S REVIEW
                <br />
                EVERY PULL REQUEST.
                <br />
                WITH DIFFGUARD
              </h1>
            </div>

            <p className="max-w-md text-xl leading-snug tracking-tight text-text-muted/80 xl:text-2xl">
              Security-first AI reviews for every pull request —
              <br />
              one clear summary comment, no noise.
            </p>
          </div>

          {/* Giant brand watermark */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 select-none overflow-hidden"
          >
            <p className="translate-y-1/4 whitespace-nowrap text-[clamp(5rem,14vw,10rem)] font-bold leading-none tracking-[-0.08em] text-text-primary/[0.045]">
              DIFFGUARD
            </p>
          </div>
        </aside>

        {/* Right — auth form column */}
        <main className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,color-mix(in_srgb,var(--bg-raised)_55%,transparent),transparent_65%)] lg:bg-none"
          />

          <div className="relative z-10 mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-bg-surface">
              <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
            </span>
            <span className="text-sm font-medium tracking-tight text-text-primary">
              DiffGuard
            </span>
          </div>

          <div className="relative z-10 w-full max-w-[400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
