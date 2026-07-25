import {
  ArrowRight,
  Check,
  ExternalLink,
  GitFork,
  GitPullRequest,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type GitHubOnboardingProps = {
  stage: "connect" | "install";
  installUrl: string;
};

const setupSteps = [
  "Connect your GitHub account",
  "Choose repositories",
  "Open a pull request",
];

export function GitHubOnboarding({
  stage,
  installUrl,
}: GitHubOnboardingProps) {
  const isConnectStage = stage === "connect";
  const activeStep = isConnectStage ? 0 : 1;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-bg-surface">
      <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative border-b border-border-default px-6 py-8 sm:px-10 sm:py-12 lg:border-r lg:border-b-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,color-mix(in_srgb,var(--accent-primary)_18%,transparent),transparent_42%)]" />
          <div className="relative max-w-xl">
            <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-accent-primary/30 bg-accent-primary/10">
              {isConnectStage ? (
                <GitFork className="h-5 w-5 text-accent-primary" aria-hidden />
              ) : (
                <ShieldCheck className="h-5 w-5 text-accent-primary" aria-hidden />
              )}
            </span>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-primary">
              Dashboard setup · {activeStep + 1} of 3
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              {isConnectStage
                ? "Connect GitHub before your first review."
                : "Choose the repositories DiffGuard should review."}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-text-muted">
              {isConnectStage
                ? "Linking GitHub lets DiffGuard show only the installations your account can access. You will return here as soon as GitHub confirms it."
                : "GitHub owns repository permissions, so the final selection happens on its secure install page. Select one repo to start small, or choose every repository you manage."}
            </p>

            <Button
              asChild
              size="lg"
              className="mt-7 bg-accent-primary text-bg-base hover:bg-accent-primary/90"
            >
              <a
                href={
                  isConnectStage
                    ? "/api/auth/github/start?returnTo=%2Fdashboard"
                    : installUrl
                }
                {...(!isConnectStage
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {isConnectStage ? "Connect GitHub" : "Choose repositories"}
                {isConnectStage ? (
                  <ArrowRight aria-hidden />
                ) : (
                  <ExternalLink aria-hidden />
                )}
              </a>
            </Button>

            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-text-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" aria-hidden />
              GitHub controls consent and repository permissions. DiffGuard
              never receives your GitHub password or a personal access token.
            </p>
          </div>
        </div>

        <div className="bg-bg-raised/30 px-6 py-8 sm:px-10 sm:py-12">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-text-muted">
            Your path to the first review
          </p>
          <ol className="mt-7 space-y-6">
            {setupSteps.map((step, index) => {
              const complete = index < activeStep;
              const active = index === activeStep;
              return (
                <li key={step} className="flex gap-3.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                      complete
                        ? "border-accent-primary bg-accent-primary text-bg-base"
                        : active
                          ? "border-accent-primary text-accent-primary"
                          : "border-border-default text-text-muted"
                    }`}
                  >
                    {complete ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                  </span>
                  <div className="pt-0.5">
                    <p
                      className={
                        active || complete ? "text-sm text-text-primary" : "text-sm text-text-muted"
                      }
                    >
                      {step}
                    </p>
                    {index === 2 ? (
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        DiffGuard posts one review comment directly on the PR.
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {stage === "install" ? (
            <div className="mt-8 flex items-start gap-3 rounded-lg border border-border-default bg-bg-surface px-4 py-3">
              <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden />
              <p className="text-xs leading-5 text-text-muted">
                After installation, return here and open a new pull request to
                see the first review appear.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
