import { UserButton } from "@clerk/nextjs";
import { Shield } from "lucide-react";

import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { getDashboardAccess } from "@/lib/auth/access";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await getDashboardAccess();
  const hasWorkspace = access.status === "ready" && access.installationIds.length > 0;

  return (
    <div className="min-h-screen bg-bg-base">
      {hasWorkspace ? <DashboardNavigation /> : <OnboardingHeader />}
      <main className={hasWorkspace ? "min-h-screen lg:pl-60" : "min-h-screen"}>
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
        </div>
      </main>
    </div>
  );
}

function OnboardingHeader() {
  return (
    <header className="border-b border-border-default bg-bg-surface/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-bg-raised">
            <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            DiffGuard
          </span>
        </span>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </div>
    </header>
  );
}
