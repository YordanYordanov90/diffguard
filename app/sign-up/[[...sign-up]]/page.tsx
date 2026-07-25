import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthShell>
      <div className="auth-form-stack">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-text-primary">
            Join DiffGuard
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Connect GitHub and start reviewing every pull request with confidence.
          </p>
        </div>
        <SignUp
          appearance={clerkAppearance}
          fallbackRedirectUrl="/dashboard"
          signInUrl="/sign-in"
        />
      </div>
    </AuthShell>
  );
}
