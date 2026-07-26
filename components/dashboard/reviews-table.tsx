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
  /** When true, omit outer panel chrome (used inside overview recent-reviews). */
  embedded?: boolean;
};

export function ReviewsTable({
  reviews,
  embedded = false,
}: ReviewsTableProps) {
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
      <section
        className={cn(
          "bg-bg-surface",
          embedded
            ? "px-5 py-8"
            : "rounded-lg border border-border-default px-5 py-8",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-raised">
            <GitPullRequest className="h-4 w-4 text-text-muted" aria-hidden />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="text-sm font-medium text-text-primary">
                No reviews yet
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Once DiffGuard reviews a pull request on an installation you can
                access, it will appear here.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border-default bg-bg-raised text-text-primary hover:bg-bg-raised/80"
              onClick={refresh}
              disabled={isPending}
            >
              <RefreshCw
                className={cn("h-4 w-4", isPending && "motion-safe:animate-spin")}
                aria-hidden
              />
              Refresh
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          embedded
            ? "border-b border-border-default px-4 py-2.5 sm:px-5"
            : "mb-3",
        )}
      >
        <p className="font-mono text-[11px] text-text-muted">
          Auto-refreshes every {POLL_INTERVAL_MS / 1000}s
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 border-border-default bg-bg-surface px-2.5 text-xs text-text-primary hover:bg-bg-raised"
          onClick={refresh}
          disabled={isPending}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isPending && "motion-safe:animate-spin")}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      <div
        className={cn(
          "overflow-hidden bg-bg-surface",
          !embedded && "rounded-lg border border-border-default",
        )}
      >
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-border-default hover:bg-transparent">
                <TableHead className="h-10 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Repository
                </TableHead>
                <TableHead className="h-10 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  PR
                </TableHead>
                <TableHead className="h-10 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Status
                </TableHead>
                <TableHead className="h-10 px-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Findings
                </TableHead>
                <TableHead className="h-10 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Model
                </TableHead>
                <TableHead className="h-10 px-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Duration
                </TableHead>
                <TableHead className="h-10 px-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => (
                <TableRow
                  key={review.id}
                  className="h-12 cursor-pointer border-border-default transition-colors hover:bg-bg-raised/50 data-[state=selected]:bg-bg-raised"
                  data-state={selectedId === review.id ? "selected" : undefined}
                  onClick={() => setSelectedId(review.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(review.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open review for ${review.repositoryName} PR ${review.prNumber}`}
                >
                  <TableCell
                    className="max-w-[14rem] truncate px-4 font-mono text-xs text-text-primary"
                    title={review.repositoryName}
                  >
                    {review.repositoryName}
                  </TableCell>
                  <TableCell className="px-4">
                    <a
                      href={githubPrUrl(
                        review.repositoryName,
                        review.prNumber,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-primary"
                      onClick={(event) => event.stopPropagation()}
                    >
                      #{review.prNumber}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </TableCell>
                  <TableCell className="px-4">
                    <StatusBadge status={review.status} />
                  </TableCell>
                  <TableCell className="px-4 text-right font-mono text-xs tabular-nums text-text-primary">
                    {review.findingsCount}
                  </TableCell>
                  <TableCell
                    className="max-w-[10rem] truncate px-4 font-mono text-xs text-text-muted"
                    title={review.model ?? undefined}
                  >
                    {review.model ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 text-right font-mono text-xs tabular-nums text-text-muted">
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

        {/* Narrow screens: row open-control and PR link are siblings */}
        <ul className="divide-y divide-border-default md:hidden">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="px-4 py-3 transition-colors hover:bg-bg-raised/50"
            >
              <button
                type="button"
                className="flex w-full flex-col gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                onClick={() => setSelectedId(review.id)}
                aria-label={`Open review for ${review.repositoryName} PR ${review.prNumber}`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span
                    className="truncate font-mono text-xs text-text-primary"
                    title={review.repositoryName}
                  >
                    {review.repositoryName}
                  </span>
                  <StatusBadge status={review.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
                  <span className="tabular-nums">
                    {review.findingsCount}{" "}
                    {review.findingsCount === 1 ? "finding" : "findings"}
                  </span>
                  <span>{formatTimestamp(review.createdAt)}</span>
                </div>
              </button>
              <a
                href={githubPrUrl(review.repositoryName, review.prNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                #{review.prNumber}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
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
