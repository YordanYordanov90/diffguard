import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Shield } from "lucide-react";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await auth.protect();

  return (
    <div className="flex min-h-screen flex-col bg-bg-base">
      <header className="sticky top-0 z-20 border-b border-border-default bg-bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-bg-raised">
              <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight text-text-primary">
              DiffGuard
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
