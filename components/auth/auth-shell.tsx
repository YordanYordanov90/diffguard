import { Shield } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] min-h-0 items-center justify-center overflow-hidden bg-bg-base p-0 sm:p-6 lg:p-10">
      <div className="relative grid h-full w-full max-w-[1424px] overflow-hidden bg-bg-base sm:h-[min(950px,calc(100dvh-3rem))] sm:rounded-xl sm:border sm:border-border-default lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden lg:flex lg:flex-col">
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
          <div aria-hidden className="auth-grid pointer-events-none absolute inset-0 opacity-35" />
          <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-border-default" />

          <div className="relative z-10 flex flex-1 flex-col justify-between p-12 xl:p-16">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border-default/80 bg-bg-surface/60 backdrop-blur-sm">
                  <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
                </span>
                <span className="text-sm font-medium tracking-tight text-text-primary">
                  DiffGuard
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                PR intelligence
              </span>
            </div>

            <div className="max-w-xl">
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-primary">
                Your pull-request control room
              </p>
              <h1 className="auth-headline text-[clamp(3.4rem,5.2vw,5.7rem)] font-bold leading-[0.94] tracking-[-0.065em]">
                LET&apos;S REVIEW
                <br />
                EVERY PULL REQUEST.
                <br />
                WITH DIFFGUARD
              </h1>
            </div>

            <div className="max-w-md border-l border-accent-primary/50 pl-5">
              <p className="text-xl leading-snug tracking-tight text-text-muted/80 xl:text-2xl">
                Security-first AI reviews for every pull request — one clear
                summary comment, no noise.
              </p>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                No source code is stored
              </p>
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 select-none overflow-hidden"
          >
            <p className="translate-y-1/4 whitespace-nowrap text-[clamp(5rem,14vw,10rem)] font-bold leading-none tracking-[-0.08em] text-text-primary/[0.045]">
              DIFFGUARD
            </p>
          </div>
        </aside>

        <main className="relative flex min-h-0 flex-col items-center justify-center overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,color-mix(in_srgb,var(--bg-raised)_55%,transparent),transparent_65%)] lg:bg-none"
          />
          <div aria-hidden className="auth-grid pointer-events-none absolute inset-0 opacity-20 lg:hidden" />

          <div className="relative z-10 mb-9 flex w-full max-w-[430px] items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border-default bg-bg-surface">
                <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
              </span>
              <span className="text-sm font-medium tracking-tight text-text-primary">
                DiffGuard
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
              Secure access
            </span>
          </div>

          <div className="relative z-10 w-full max-w-[430px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
