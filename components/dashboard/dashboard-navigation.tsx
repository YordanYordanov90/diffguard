"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  FolderGit2,
  GitPullRequest,
  LayoutDashboard,
  Menu,
  Shield,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/reviews", label: "Reviews", icon: GitPullRequest },
  { href: "/dashboard/repositories", label: "Repositories", icon: FolderGit2 },
  { href: "/dashboard/learnings", label: "Learnings", icon: BookMarked },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-bg-raised">
        <Shield className="h-4 w-4 text-accent-primary" aria-hidden />
      </span>
      <span
        className={cn(
          "text-sm font-semibold tracking-tight text-text-primary",
          compact && "sr-only",
        )}
      >
        DiffGuard
      </span>
    </span>
  );
}

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Dashboard" className="space-y-0.5">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
              active
                ? "bg-bg-raised text-text-primary"
                : "text-text-muted hover:bg-bg-raised/60 hover:text-text-primary",
            )}
          >
            {active ? (
              <span
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent-primary"
                aria-hidden
              />
            ) : null}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active
                  ? "text-accent-primary"
                  : "text-text-muted group-hover:text-text-primary",
              )}
              aria-hidden
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserAccount() {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    />
  );
}

export function DashboardNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPage =
    navigation.find(({ href }) => isActivePath(pathname, href))?.label ??
    "Dashboard";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border-default bg-bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border-default px-5">
          <Link
            href="/dashboard"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            aria-label="DiffGuard overview"
          >
            <Brand />
          </Link>
        </div>
        <div className="flex flex-1 flex-col px-3 py-5">
          <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Workspace
          </p>
          <NavigationLinks pathname={pathname} />
          <div className="mt-auto flex items-center justify-between border-t border-border-default px-3 pt-4">
            <span className="text-xs text-text-muted">GitHub account</span>
            <UserAccount />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-default bg-bg-surface/95 px-4 backdrop-blur-sm lg:hidden">
        <Link
          href="/dashboard"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          aria-label="DiffGuard overview"
        >
          <Brand compact />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">{currentPage}</span>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open dashboard navigation"
              >
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(84vw,20rem)] border-border-default bg-bg-surface p-0"
            >
              <SheetHeader className="border-b border-border-default px-5 py-4 text-left">
                <SheetTitle className="text-text-primary">
                  <Brand />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Dashboard navigation
                </SheetDescription>
              </SheetHeader>
              <div className="px-3 py-5">
                <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                  Workspace
                </p>
                <NavigationLinks
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-border-default px-5 py-4">
                <span className="text-xs text-text-muted">GitHub account</span>
                <UserAccount />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
