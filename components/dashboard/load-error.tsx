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
    <section className="rounded-lg border border-border-default bg-bg-surface p-8 sm:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-default bg-bg-raised">
          <AlertTriangle className="h-5 w-5 text-state-warning" aria-hidden />
        </span>
        <h2 className="text-lg font-medium text-text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{description}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-6 border-border-default bg-bg-raised text-text-primary hover:bg-bg-raised/80"
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
    </section>
  );
}
