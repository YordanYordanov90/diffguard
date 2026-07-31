"use client";

import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LearningStatus } from "@/lib/db/schema";

export function LearningsFilters({
  query,
  repository,
  status,
  repositories,
  filteredCount,
  totalCount,
  onQueryChange,
  onRepositoryChange,
  onStatusChange,
  onClear,
}: {
  query: string;
  repository: string;
  status: LearningStatus | "all";
  repositories: string[];
  filteredCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onRepositoryChange: (value: string) => void;
  onStatusChange: (value: LearningStatus | "all") => void;
  onClear: () => void;
}) {
  const hasFilters =
    query.trim().length > 0 || repository.length > 0 || status !== "all";

  return (
    <>
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
            onChange={(event) => onQueryChange(event.target.value)}
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
          onChange={(event) => onRepositoryChange(event.target.value)}
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
            onStatusChange(event.target.value as LearningStatus | "all")
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
            onClick={onClear}
            className="text-text-muted"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
      <p className="font-mono text-xs text-text-muted">
        {filteredCount} of {totalCount} learnings
      </p>
    </>
  );
}
