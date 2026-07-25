"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";

import { ReviewDetailSheet } from "@/components/dashboard/review-detail-sheet";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDuration,
  formatTimestamp,
  githubPrUrl,
} from "@/lib/dashboard/format";
import type { DashboardReview } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5000;

type ReviewsTableProps = {
  reviews: DashboardReview[];
};

export function ReviewsTable({ reviews }: ReviewsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const selected =
    selectedId === null
      ? null
      : (reviews.find((review) => review.id === selectedId) ?? null);

  if (reviews.length === 0) {
    return (
      <section className="rounded-lg border border-border-default bg-bg-surface p-8 sm:p-12">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border-default bg-bg-raised">
            <GitPullRequest
              className="h-5 w-5 text-accent-primary"
              aria-hidden
            />
          </span>
          <h2 className="text-lg font-medium text-text-primary">
            No reviews yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Once DiffGuard reviews a pull request on an installation you can
            access, it will appear here.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-6 border-border-default bg-bg-raised text-text-primary hover:bg-bg-raised/80"
            onClick={refresh}
            disabled={isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4", isPending && "animate-spin")}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          Auto-refreshes every {POLL_INTERVAL_MS / 1000}s
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-border-default bg-bg-surface text-text-primary hover:bg-bg-raised"
          onClick={refresh}
          disabled={isPending}
        >
          <RefreshCw
            className={cn("h-4 w-4", isPending && "animate-spin")}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="border-border-default hover:bg-transparent">
              <TableHead className="px-4 text-text-muted">Repository</TableHead>
              <TableHead className="px-4 text-text-muted">PR</TableHead>
              <TableHead className="px-4 text-text-muted">Status</TableHead>
              <TableHead className="px-4 text-right text-text-muted">
                Findings
              </TableHead>
              <TableHead className="px-4 text-text-muted">Model</TableHead>
              <TableHead className="px-4 text-right text-text-muted">
                Duration
              </TableHead>
              <TableHead className="px-4 text-right text-text-muted">
                When
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow
                key={review.id}
                className="cursor-pointer border-border-default hover:bg-bg-raised/60 data-[state=selected]:bg-bg-raised"
                data-state={selectedId === review.id ? "selected" : undefined}
                onClick={() => setSelectedId(review.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(review.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open review for ${review.repositoryName} PR ${review.prNumber}`}
              >
                <TableCell className="px-4 font-mono text-xs text-text-primary">
                  {review.repositoryName}
                </TableCell>
                <TableCell className="px-4">
                  <a
                    href={githubPrUrl(review.repositoryName, review.prNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-accent-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    #{review.prNumber}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </TableCell>
                <TableCell className="px-4">
                  <StatusBadge status={review.status} />
                </TableCell>
                <TableCell className="px-4 text-right font-mono text-xs text-text-primary">
                  {review.findingsCount}
                </TableCell>
                <TableCell className="max-w-[10rem] truncate px-4 font-mono text-xs text-text-muted">
                  {review.model ?? "—"}
                </TableCell>
                <TableCell className="px-4 text-right font-mono text-xs text-text-muted">
                  {formatDuration(review.durationMs)}
                </TableCell>
                <TableCell className="px-4 text-right font-mono text-xs text-text-muted">
                  {formatTimestamp(review.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReviewDetailSheet
        review={selected}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
