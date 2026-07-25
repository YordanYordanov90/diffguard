import { GitBranch, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GitHubAuthForm } from "@/components/auth/github-auth-form";

export default function SignInPage() {
  return (
    <AuthShell>
      <div className="auth-form-stack">
        <div className="mb-8 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-accent-primary/25 bg-accent-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent-primary">
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            GitHub access
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-text-primary">
            Continue your review loop.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
            Use GitHub to open the reviews and installations you can access.
          </p>
        </div>
        <GitHubAuthForm mode="sign-in" />
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-text-muted">
          <ShieldCheck className="h-4 w-4 text-accent-primary" aria-hidden />
          Your repository code is never stored.
        </p>
      </div>
    </AuthShell>
  );
}
