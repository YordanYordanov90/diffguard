import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/auth-shell";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthShell>
      <div className="auth-form-stack">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-text-primary">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Sign in to see what DiffGuard found in your latest reviews.
          </p>
        </div>
        <SignIn
          appearance={clerkAppearance}
          fallbackRedirectUrl="/dashboard"
          signUpUrl="/sign-up"
        />
      </div>
    </AuthShell>
  );
}
