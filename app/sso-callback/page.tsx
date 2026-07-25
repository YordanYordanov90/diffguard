"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/dashboard"
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl="/dashboard"
      signUpUrl="/sign-up"
    />
  );
}
