import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewStatus, SkipReason } from "@/lib/dashboard/types";
import { formatSkipReason } from "@/lib/dashboard/format";

const statusStyles: Record<ReviewStatus, string> = {
  completed:
    "border-state-success/30 bg-state-success/10 text-state-success",
  failed: "border-state-error/30 bg-state-error/10 text-state-error",
  running: "border-state-info/30 bg-state-info/10 text-state-info",
  queued:
    "border-border-default bg-bg-raised text-text-muted",
  skipped:
    "border-state-warning/30 bg-state-warning/10 text-state-warning",
};

const inProgressStatuses = new Set<ReviewStatus>(["queued", "running"]);

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const showSpinner = inProgressStatuses.has(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 rounded-md capitalize",
        statusStyles[status],
      )}
    >
      {showSpinner ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
      ) : null}
      {status}
    </Badge>
  );
}

export function SkipReasonBadge({ reason }: { reason: SkipReason }) {
  return (
    <Badge
      variant="outline"
      className="rounded-md border-state-warning/30 bg-state-warning/10 capitalize text-state-warning"
    >
      {formatSkipReason(reason)}
    </Badge>
  );
}
