"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/dashboard/format";
import type { DashboardLearning } from "@/lib/dashboard/learnings";
import { LEARNING_GUIDANCE_MAX_CHARS } from "@/lib/config/constants";
import { cn } from "@/lib/utils";
import type { ConfirmKind } from "./learning-card-types";

export function LearningCardHeader({
  learning,
  isEditing,
  confirm,
  isPending,
  onBeginEdit,
  onRequestArchive,
  onRequestReactivate,
}: {
  learning: DashboardLearning;
  isEditing: boolean;
  confirm: ConfirmKind | null;
  isPending: boolean;
  onBeginEdit: () => void;
  onRequestArchive: () => void;
  onRequestReactivate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="font-mono text-xs text-text-muted">
          {learning.repositoryFullName}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LearningStatusBadge status={learning.status} />
          <span className="font-mono text-xs text-text-muted">
            by {learning.createdBy}
          </span>
          <span className="font-mono text-xs text-text-muted">
            created {formatTimestamp(learning.createdAt)}
          </span>
        </div>
      </div>
      {!isEditing && !confirm ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onBeginEdit}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={
              learning.status === "active"
                ? onRequestArchive
                : onRequestReactivate
            }
          >
            {learning.status === "active" ? "Archive" : "Reactivate"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LearningCardBody({
  learning,
  isEditing,
  editText,
  onEditTextChange,
  isPending,
  confirm,
  onCancelEdit,
  onSaveEdit,
  onCancelConfirm,
  onConfirmArchive,
  onConfirmReactivate,
  sourcePrHref,
}: {
  learning: DashboardLearning;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  isPending: boolean;
  confirm: ConfirmKind | null;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onCancelConfirm: () => void;
  onConfirmArchive: () => void;
  onConfirmReactivate: () => void;
  sourcePrHref: string | null;
}) {
  return (
    <div className="space-y-3 px-4 py-3">
      {isEditing ? (
        <LearningEditor
          learningId={learning.id}
          editText={editText}
          isPending={isPending}
          onEditTextChange={onEditTextChange}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-text-primary">
          {learning.guidance}
        </p>
      )}
      {confirm ? (
        <ConfirmPanel
          kind={confirm}
          isPending={isPending}
          onCancel={onCancelConfirm}
          onConfirm={
            confirm === "archive" ? onConfirmArchive : onConfirmReactivate
          }
        />
      ) : null}
      <LearningMetadata
        learning={learning}
        sourcePrHref={sourcePrHref}
      />
    </div>
  );
}

function LearningEditor({
  learningId,
  editText,
  isPending,
  onEditTextChange,
  onCancelEdit,
  onSaveEdit,
}: {
  learningId: string;
  editText: string;
  isPending: boolean;
  onEditTextChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={`edit-${learningId}`}>
        Learning guidance
      </label>
      <textarea
        id={`edit-${learningId}`}
        value={editText}
        maxLength={LEARNING_GUIDANCE_MAX_CHARS}
        onChange={(event) => onEditTextChange(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-text-muted">
          {editText.trim().length}/{LEARNING_GUIDANCE_MAX_CHARS}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onCancelEdit}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || editText.trim().length === 0}
            onClick={onSaveEdit}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmPanel({
  kind,
  isPending,
  onCancel,
  onConfirm,
}: {
  kind: ConfirmKind;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = kind === "archive" ? "Archive this learning?" : "Reactivate this learning?";
  const body =
    kind === "archive"
      ? "Archived learnings stop affecting future reviews. You can reactivate later."
      : "Active learnings are included in future reviews for this repository, still subordinate to DiffGuard security rules.";
  const confirmLabel = kind === "archive" ? "Archive" : "Reactivate";

  return (
    <div
      role="group"
      aria-label={title}
      className="rounded-md border border-border-default bg-bg-raised px-3 py-3"
    >
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="mt-1 text-xs text-text-muted">{body}</p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function LearningMetadata({
  learning,
  sourcePrHref,
}: {
  learning: DashboardLearning;
  sourcePrHref: string | null;
}) {
  return (
    <dl className="grid gap-2 border-t border-border-default pt-3 text-xs text-text-muted sm:grid-cols-2">
      <div>
        <dt className="font-mono uppercase tracking-wide">Usage</dt>
        <dd className="mt-0.5 font-mono text-text-primary">
          {learning.usageCount}
          {learning.lastUsedAt
            ? ` · last ${formatTimestamp(learning.lastUsedAt)}`
            : " · never used"}
        </dd>
      </div>
      <div>
        <dt className="font-mono uppercase tracking-wide">Last change</dt>
        <dd className="mt-0.5 font-mono text-text-primary">
          {learning.lastModifiedBy && learning.lastModifiedAt
            ? `${learning.lastAction ?? "updated"} by ${learning.lastModifiedBy} · ${formatTimestamp(learning.lastModifiedAt)}`
            : "—"}
        </dd>
      </div>
      <div>
        <dt className="font-mono uppercase tracking-wide">Source</dt>
        <dd className="mt-0.5">
          {sourcePrHref && learning.sourcePrNumber !== null ? (
            <Link
              href={sourcePrHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-text-primary outline-none hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              PR #{learning.sourcePrNumber}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : (
            <span className="font-mono text-text-primary">—</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function LearningStatusBadge({ status }: { status: "active" | "archived" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize",
        status === "active"
          ? "border-state-success/30 bg-state-success/10 text-state-success"
          : "border-border-default bg-bg-raised text-text-muted",
      )}
    >
      {status}
    </span>
  );
}
