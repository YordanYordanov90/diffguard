import { ExternalLink } from "lucide-react";

import { SkipReasonBadge, StatusBadge } from "@/components/dashboard/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatDuration,
  formatTimestamp,
  githubPrUrl,
  shortSha,
} from "@/lib/dashboard/format";
import type { DashboardReview } from "@/lib/dashboard/types";

type ReviewDetailSheetProps = {
  review: DashboardReview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewDetailSheet({
  review,
  open,
  onOpenChange,
}: ReviewDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden border-border-default bg-bg-surface p-0 sm:max-w-xl"
      >
        {review ? (
          <>
            <SheetHeader className="border-b border-border-default px-6 py-5">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <StatusBadge status={review.status} />
                {review.status === "skipped" && review.skipReason ? (
                  <SkipReasonBadge reason={review.skipReason} />
                ) : null}
              </div>
              <SheetTitle className="font-mono text-base text-text-primary">
                {review.repositoryName}
                <span className="text-text-muted"> #{review.prNumber}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-text-muted">
                <span>{shortSha(review.headSha)}</span>
                <span>{formatTimestamp(review.createdAt)}</span>
                <span>{formatDuration(review.durationMs)}</span>
                {review.model ? <span>{review.model}</span> : null}
              </SheetDescription>
              <a
                href={githubPrUrl(review.repositoryName, review.prNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-xs text-accent-primary hover:underline"
              >
                Open on GitHub
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {review.status === "failed" && review.error ? (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-state-error/30 bg-state-error/10 px-4 py-3 text-sm text-state-error"
                >
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">
                    Error
                  </p>
                  <p className="whitespace-pre-wrap break-words">{review.error}</p>
                </div>
              ) : null}

              {review.reviewMarkdown ? (
                <article className="prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text-primary">
                    {review.reviewMarkdown}
                  </pre>
                </article>
              ) : (
                <p className="text-sm text-text-muted">
                  {review.status === "queued" || review.status === "running"
                    ? "Review is still in progress."
                    : review.status === "skipped"
                      ? "No review body — this PR was skipped."
                      : "No review markdown stored for this run."}
                </p>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
