"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadErrorProps = {
  title?: string;
  description?: string;
};

export function LoadError({
  title = "Coverage could not be loaded",
  description = "Something went wrong while loading this page. Try again in a moment.",
}: LoadErrorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-lg border border-border-default bg-bg-surface px-5 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-raised">
          <AlertTriangle className="h-4 w-4 text-state-warning" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-sm font-medium text-text-primary">{title}</h2>
            <p className="mt-1 text-sm text-text-muted">{description}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border-default bg-bg-raised text-text-primary hover:bg-bg-raised/80"
            onClick={() => {
              startTransition(() => {
                router.refresh();
              });
            }}
            disabled={isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4", isPending && "animate-spin")}
              aria-hidden
            />
            Try again
          </Button>
        </div>
      </div>
    </section>
  );
}
