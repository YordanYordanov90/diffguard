"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  EmptyLearnings,
  LearningCard,
  type ConfirmKind,
} from "@/components/dashboard/learning-card";
import { LearningsFilters } from "@/components/dashboard/learnings-filters";
import { Button } from "@/components/ui/button";
import {
  archiveRepositoryLearningAction,
  editRepositoryLearningAction,
  reactivateRepositoryLearningAction,
} from "@/lib/dashboard/learning-actions";
import {
  filterDashboardLearnings,
  groupDashboardLearnings,
  type DashboardLearning,
} from "@/lib/dashboard/learnings";

type LearningsInventoryProps = {
  learnings: DashboardLearning[];
  repositories: string[];
};

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
  const groups = useMemo(
    () => groupDashboardLearnings(filtered),
    [filtered],
  );

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

  function runAction(
    task: () => Promise<{ success: boolean; error: string | null }>,
  ) {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (!result.success) {
          setActionError(result.error ?? "The change could not be saved.");
          return;
        }
        setConfirm(null);
        setEditingId(null);
        setEditText("");
        router.refresh();
      } catch {
        setActionError("The change could not be saved.");
      }
    });
  }

  if (learnings.length === 0) return <EmptyLearnings />;

  return (
    <div className="space-y-4">
      <LearningsFilters
        query={query}
        repository={repository}
        status={status}
        repositories={repositories}
        filteredCount={filtered.length}
        totalCount={learnings.length}
        onQueryChange={setQuery}
        onRepositoryChange={setRepository}
        onStatusChange={setStatus}
        onClear={clearFilters}
      />

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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="mt-2 text-text-muted"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((installation) => (
            <section
              key={installation.installationId}
              aria-labelledby={`installation-${installation.installationId}`}
              className="space-y-4"
            >
              <div className="border-b border-border-default pb-2">
                <h2
                  id={`installation-${installation.installationId}`}
                  className="text-sm font-semibold text-text-primary"
                >
                  {installation.accountLogin}
                </h2>
                <p className="font-mono text-xs text-text-muted">
                  {installation.accountType} installation
                </p>
              </div>
              <div className="space-y-5 pl-3 sm:pl-4">
                {installation.repositories.map((repositoryGroup) => (
                  <section
                    key={`${installation.installationId}-${repositoryGroup.repositoryId}`}
                    aria-labelledby={`repository-${installation.installationId}-${repositoryGroup.repositoryId}`}
                    className="space-y-3"
                  >
                    <h3
                      id={`repository-${installation.installationId}-${repositoryGroup.repositoryId}`}
                      className="font-mono text-xs font-medium text-text-muted"
                    >
                      {repositoryGroup.repositoryFullName}
                    </h3>
                    <ul className="space-y-3">
                      {repositoryGroup.learnings.map((learning) => (
                        <li key={learning.id}>
                          <LearningCard
                            learning={learning}
                            isEditing={editingId === learning.id}
                            editText={editText}
                            onEditTextChange={setEditText}
                            isPending={isPending}
                            confirm={
                              confirm?.id === learning.id
                                ? confirm.kind
                                : null
                            }
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
                              setConfirm({
                                id: learning.id,
                                kind: "reactivate",
                              });
                            }}
                            onCancelConfirm={() => setConfirm(null)}
                            onConfirmArchive={() =>
                              runAction(() =>
                                archiveRepositoryLearningAction({
                                  learningId: learning.id,
                                }),
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
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
