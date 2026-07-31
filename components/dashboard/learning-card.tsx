"use client";

import { BookMarked } from "lucide-react";

import {
  LearningCardBody,
  LearningCardHeader,
} from "@/components/dashboard/learning-card-content";
import { githubPrUrl, isRepositoryFullName } from "@/lib/dashboard/format";
import type { LearningCardProps } from "./learning-card-types";

export type { ConfirmKind, LearningCardProps } from "./learning-card-types";

export function LearningCard({
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
}: LearningCardProps) {
  const sourcePrHref =
    learning.sourcePrNumber !== null &&
    isRepositoryFullName(learning.repositoryFullName)
      ? githubPrUrl(learning.repositoryFullName, learning.sourcePrNumber)
      : null;

  return (
    <article className="rounded-lg border border-border-default bg-bg-surface">
      <LearningCardHeader
        learning={learning}
        isEditing={isEditing}
        confirm={confirm}
        isPending={isPending}
        onBeginEdit={onBeginEdit}
        onRequestArchive={onRequestArchive}
        onRequestReactivate={onRequestReactivate}
      />
      <LearningCardBody
        learning={learning}
        isEditing={isEditing}
        editText={editText}
        onEditTextChange={onEditTextChange}
        isPending={isPending}
        confirm={confirm}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
        onCancelConfirm={onCancelConfirm}
        onConfirmArchive={onConfirmArchive}
        onConfirmReactivate={onConfirmReactivate}
        sourcePrHref={sourcePrHref}
      />
    </article>
  );
}

export function EmptyLearnings() {
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
