"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

type GitHubAuthFormProps = {
  mode: "sign-in" | "sign-up";
};

function GitHubMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.54 1.03 1.54 1.03.9 1.54 2.35 1.1 2.92.84.09-.65.35-1.1.64-1.35-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.56 9.56 0 0 1 12 6.8c.85 0 1.7.11 2.5.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.91.68 1.84v2.73c0 .26.18.57.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "GitHub sign-in could not be started. Try again.";
}

export function GitHubAuthForm({ mode }: GitHubAuthFormProps) {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [error, setError] = useState<string | null>(null);
  const isSignUp = mode === "sign-up";
  const isReady = isSignUp ? Boolean(signUp) : Boolean(signIn);
  const isLoading =
    signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  async function continueWithGitHub() {
    setError(null);
    const result = isSignUp
      ? await signUp?.sso({
          strategy: "oauth_github",
          redirectUrl: "/dashboard",
          redirectCallbackUrl: "/sso-callback",
        })
      : await signIn?.sso({
          strategy: "oauth_github",
          redirectUrl: "/dashboard",
          redirectCallbackUrl: "/sso-callback",
        });

    if (!result) return;
    if (result.error) setError(errorMessage(result.error));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      <div className="h-px bg-gradient-to-r from-transparent via-accent-primary/70 to-transparent" />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 border-b border-border-default pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border-default bg-bg-base text-text-primary">
              <GitHubMark />
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">GitHub access</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                Clerk protected
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-primary">
            OAuth
          </span>
        </div>

        <button
          type="button"
          onClick={continueWithGitHub}
          disabled={isLoading || !isReady}
          className="group mt-5 flex h-12 w-full items-center justify-between rounded-lg border border-text-primary/75 bg-bg-base px-4 text-left text-sm font-medium text-text-primary transition-colors hover:border-accent-primary hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-center gap-3">
            {isLoading ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-accent-primary" aria-hidden />
            ) : (
              <GitHubMark />
            )}
            {isLoading ? "Opening GitHub…" : "Continue with GitHub"}
          </span>
          <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-primary" aria-hidden />
        </button>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs leading-5 text-state-error">
            {error}
          </p>
        ) : null}

        {isSignUp ? <div id="clerk-captcha" className="mt-3" /> : null}

        <div className="mt-5 border-t border-border-default pt-4">
          <p className="flex items-start gap-2 text-xs leading-5 text-text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" aria-hidden />
            {isSignUp
              ? "Your GitHub identity creates your DiffGuard account."
              : "GitHub confirms your identity; DiffGuard keeps your session secure."}
          </p>
          <p className="mt-4 text-center text-sm text-text-muted">
            {isSignUp ? "Already have access?" : "New to DiffGuard?"}{" "}
            <Link
              href={isSignUp ? "/sign-in" : "/sign-up"}
              className="font-medium text-accent-primary hover:text-accent-primary/80 hover:underline"
            >
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
