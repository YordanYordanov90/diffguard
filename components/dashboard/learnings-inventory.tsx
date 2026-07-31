"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookMarked, ExternalLink, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveRepositoryLearningAction,
  editRepositoryLearningAction,
  reactivateRepositoryLearningAction,
} from "@/lib/dashboard/learning-actions";
import {
  filterDashboardLearnings,
  type DashboardLearning,
} from "@/lib/dashboard/learnings";
import {
  formatTimestamp,
  githubPrUrl,
  isRepositoryFullName,
} from "@/lib/dashboard/format";
import { LEARNING_GUIDANCE_MAX_CHARS } from "@/lib/config/constants";
import { cn } from "@/lib/utils";

type LearningsInventoryProps = {
  learnings: DashboardLearning[];
  repositories: string[];
};

type ConfirmKind = "archive" | "reactivate";

export function LearningsInventory({
  learnings,
  repositories,
}: LearningsInventoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [repository, setRepository] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirm, setConfirm] = useState<{
    id: string;
    kind: ConfirmKind;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      filterDashboardLearnings(learnings, {
        repository: repository || undefined,
        status,
        query,
      }),
    [learnings, repository, status, query],
  );

  const hasFilters =
    query.trim().length > 0 || repository.length > 0 || status !== "all";

  function clearFilters() {
    setQuery("");
    setRepository("");
    setStatus("all");
  }

  function beginEdit(learning: DashboardLearning) {
    setActionError(null);
    setConfirm(null);
    setEditingId(learning.id);
    setEditText(learning.guidance);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function runAction(task: () => Promise<{ success: boolean; error: string | null }>) {
    setActionError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.success) {
        setActionError(result.error ?? "The change could not be saved.");
        return;
      }
      setConfirm(null);
      setEditingId(null);
      setEditText("");
      router.refresh();
    });
  }

  if (learnings.length === 0) {
    return <EmptyLearnings />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="sr-only" htmlFor="learnings-search">
          Search learnings
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            id="learnings-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guidance, creator, or repository"
            className="h-9 border-border-default bg-bg-base pl-8 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>
        <label className="sr-only" htmlFor="learnings-repo">
          Filter by repository
        </label>
        <select
          id="learnings-repo"
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
          className="h-9 rounded-md border border-border-default bg-bg-base px-2.5 font-mono text-xs text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          <option value="">All repositories</option>
          {repositories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="learnings-status">
          Filter by status
        </label>
        <select
          id="learnings-status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as "all" | "active" | "archived")
          }
          className="h-9 rounded-md border border-border-default bg-bg-base px-2.5 text-xs text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-text-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <p className="font-mono text-xs text-text-muted">
        {filtered.length} of {learnings.length} learnings
      </p>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-sm text-state-error"
        >
          {actionError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border-default bg-bg-surface px-4 py-10 text-center">
          <p className="text-sm text-text-muted">
            No learnings match the current filters.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((learning) => (
            <li key={learning.id}>
              <LearningCard
                learning={learning}
                isEditing={editingId === learning.id}
                editText={editText}
                onEditTextChange={setEditText}
                isPending={isPending}
                confirm={confirm?.id === learning.id ? confirm.kind : null}
                onBeginEdit={() => beginEdit(learning)}
                onCancelEdit={cancelEdit}
                onSaveEdit={() =>
                  runAction(() =>
                    editRepositoryLearningAction({
                      learningId: learning.id,
                      guidance: editText,
                    }),
                  )
                }
                onRequestArchive={() => {
                  setActionError(null);
                  setEditingId(null);
                  setConfirm({ id: learning.id, kind: "archive" });
                }}
                onRequestReactivate={() => {
                  setActionError(null);
                  setEditingId(null);
                  setConfirm({ id: learning.id, kind: "reactivate" });
                }}
                onCancelConfirm={() => setConfirm(null)}
                onConfirmArchive={() =>
                  runAction(() =>
                    archiveRepositoryLearningAction({ learningId: learning.id }),
                  )
                }
                onConfirmReactivate={() =>
                  runAction(() =>
                    reactivateRepositoryLearningAction({
                      learningId: learning.id,
                    }),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LearningCard({
  learning,
  isEditing,
  editText,
  onEditTextChange,
  isPending,
  confirm,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestArchive,
  onRequestReactivate,
  onCancelConfirm,
  onConfirmArchive,
  onConfirmReactivate,
}: {
  learning: DashboardLearning;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  isPending: boolean;
  confirm: ConfirmKind | null;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRequestArchive: () => void;
  onRequestReactivate: () => void;
  onCancelConfirm: () => void;
  onConfirmArchive: () => void;
  onConfirmReactivate: () => void;
}) {
  const sourcePrHref =
    learning.sourcePrNumber !== null &&
    isRepositoryFullName(learning.repositoryFullName)
      ? githubPrUrl(learning.repositoryFullName, learning.sourcePrNumber)
      : null;

  return (
    <article className="rounded-lg border border-border-default bg-bg-surface">
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
        <div className="flex flex-wrap gap-2">
          {!isEditing && !confirm ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={onBeginEdit}
              >
                Edit
              </Button>
              {learning.status === "active" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={onRequestArchive}
                >
                  Archive
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={onRequestReactivate}
                >
                  Reactivate
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {isEditing ? (
          <div className="space-y-2">
            <label className="sr-only" htmlFor={`edit-${learning.id}`}>
              Learning guidance
            </label>
            <textarea
              id={`edit-${learning.id}`}
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
        ) : (
          <p className="whitespace-pre-wrap text-sm text-text-primary">
            {learning.guidance}
          </p>
        )}

        {confirm === "archive" ? (
          <ConfirmPanel
            title="Archive this learning?"
            body="Archived learnings stop affecting future reviews. You can reactivate later."
            confirmLabel="Archive"
            isPending={isPending}
            onCancel={onCancelConfirm}
            onConfirm={onConfirmArchive}
          />
        ) : null}

        {confirm === "reactivate" ? (
          <ConfirmPanel
            title="Reactivate this learning?"
            body="Active learnings are included in future reviews for this repository, still subordinate to DiffGuard security rules."
            confirmLabel="Reactivate"
            isPending={isPending}
            onCancel={onCancelConfirm}
            onConfirm={onConfirmReactivate}
          />
        ) : null}

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
      </div>
    </article>
  );
}

function ConfirmPanel({
  title,
  body,
  confirmLabel,
  isPending,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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

function EmptyLearnings() {
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface px-4 py-12 text-center">
      <BookMarked
        className="mx-auto h-8 w-8 text-text-muted"
        aria-hidden
      />
      <h2 className="mt-3 text-base font-medium text-text-primary">
        No repository learnings yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        Collaborators with write access can save preferences from a DiffGuard
        inline finding with{" "}
        <span className="font-mono text-text-primary">
          @diffguard remember: …
        </span>
        . They appear here for review and archive.
      </p>
    </div>
  );
}
