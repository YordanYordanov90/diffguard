import {
  LINKED_ISSUE_BODY_CHAR_LIMIT,
  LINKED_ISSUE_TITLE_CHAR_LIMIT,
  MAX_LINKED_ISSUES,
} from "@/lib/config/constants";

import {
  issueAssessmentSchema,
  persistedIssueAssessmentSchema,
  type IssueAssessment,
  type PersistedIssueAssessment,
} from "./schema";

/**
 * Explicit GitHub closing-reference keywords (Feature 29).
 * Matches GitHub auto-close keywords: fix/fixes/fixed, close/closes/closed,
 * resolve/resolves/resolved.
 */
const CLOSING_KEYWORD =
  "(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)";

/** `Fixes #12` / `closes #3` — not bare `#12`. */
const HASH_REF = new RegExp(
  `\\b${CLOSING_KEYWORD}\\s+#(\\d+)\\b`,
  "gi",
);

/**
 * `Fixes https://github.com/owner/repo/issues/12` (optional www, safe
 * Markdown/autolink wrapper, trailing slash/query/fragment). Cross-repo URLs
 * are filtered by owner/repo.
 */
const URL_REF = new RegExp(
  `\\b${CLOSING_KEYWORD}\\s+(?:[<(])?https?://(?:www\\.)?github\\.com/([^/\\s]+)/([^/\\s]+)/issues/(\\d+)\\b(?:[/?#][^\\s>]*)?`,
  "gi",
);

export type LinkedIssueReference = {
  issueNumber: number;
};

export type LinkedIssuePromptContext = {
  issueNumber: number;
  title: string;
  body: string | null;
};

export type LinkedIssueFetchOutcome =
  | {
      status: "fetched";
      issueNumber: number;
      title: string;
      body: string | null;
    }
  | {
      status: "inaccessible";
      issueNumber: number;
      reason: "missing" | "forbidden" | "not_an_issue" | "invalid" | "unavailable";
    };

function parseRepositoryName(fullName: string): { owner: string; repo: string } | null {
  const [owner, repo, ...extra] = fullName.split("/");
  if (!owner || !repo || extra.length > 0) return null;
  return { owner, repo };
}

function normalizeLogin(value: string): string {
  return decodeURIComponent(value).toLowerCase();
}

/**
 * Parse explicit GitHub closing references from a PR body.
 * Same-repository only; max three unique issue numbers in first-seen order.
 * Casual `#123` mentions, comments-only refs, and cross-repo links are ignored.
 */
export function parseLinkedIssueReferences(
  prBody: string | null | undefined,
  repoFullName: string,
): LinkedIssueReference[] {
  if (!prBody || prBody.trim().length === 0) return [];
  const repo = parseRepositoryName(repoFullName);
  if (!repo) return [];

  const seen = new Set<number>();
  const ordered: number[] = [];
  const matches: Array<{ index: number; raw: string }> = [];

  const add = (raw: string) => {
    const issueNumber = Number(raw);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) return;
    if (seen.has(issueNumber)) return;
    if (ordered.length >= MAX_LINKED_ISSUES) return;
    seen.add(issueNumber);
    ordered.push(issueNumber);
  };

  for (const match of prBody.matchAll(HASH_REF)) {
    matches.push({ index: match.index ?? 0, raw: match[1] ?? "" });
  }

  for (const match of prBody.matchAll(URL_REF)) {
    const owner = match[1] ?? "";
    const name = match[2] ?? "";
    const number = match[3] ?? "";
    if (
      normalizeLogin(owner) !== normalizeLogin(repo.owner) ||
      normalizeLogin(name) !== normalizeLogin(repo.repo)
    ) {
      continue;
    }
    matches.push({ index: match.index ?? 0, raw: number });
  }

  for (const match of matches.sort((left, right) => left.index - right.index)) {
    add(match.raw);
  }

  return ordered.map((issueNumber) => ({ issueNumber }));
}

export function boundIssueTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return "(untitled)";
  return trimmed.slice(0, LINKED_ISSUE_TITLE_CHAR_LIMIT);
}

export function boundIssueBody(body: string | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, LINKED_ISSUE_BODY_CHAR_LIMIT);
}

export function toLinkedIssuePromptContext(
  outcomes: LinkedIssueFetchOutcome[],
): LinkedIssuePromptContext[] {
  return outcomes
    .filter((outcome): outcome is Extract<LinkedIssueFetchOutcome, { status: "fetched" }> =>
      outcome.status === "fetched",
    )
    .map((outcome) => ({
      issueNumber: outcome.issueNumber,
      title: boundIssueTitle(outcome.title),
      body: boundIssueBody(outcome.body),
    }));
}

function unclearAssessment(
  issueNumber: number,
  rationale: string,
): IssueAssessment {
  return {
    issueNumber,
    status: "unclear",
    rationale,
    unmetRequirements: [],
  };
}

/**
 * Keep only model assessments for allowlisted issue numbers. Omitted or
 * inaccessible issues become `unclear`; fabricated issue numbers are dropped.
 */
export function reconcileLinkedIssueAssessments(
  allowlisted: LinkedIssueReference[],
  modelAssessments: IssueAssessment[],
  inaccessible: ReadonlyMap<number, string>,
): IssueAssessment[] {
  const allowlistedNumbers = allowlisted.map((ref) => ref.issueNumber);
  const allowlistedSet = new Set(allowlistedNumbers);
  const byNumber = new Map<number, IssueAssessment>();

  for (const raw of modelAssessments) {
    const parsed = issueAssessmentSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (!allowlistedSet.has(parsed.data.issueNumber)) continue;
    if (byNumber.has(parsed.data.issueNumber)) continue;
    byNumber.set(parsed.data.issueNumber, parsed.data);
  }

  return allowlistedNumbers.map((issueNumber) => {
    const accessReason = inaccessible.get(issueNumber);
    if (accessReason !== undefined) {
      return unclearAssessment(issueNumber, accessReason);
    }
    return byNumber.get(issueNumber) ?? unclearAssessment(
      issueNumber,
      "The model did not return an assessment for this allowlisted issue.",
    );
  });
}

export function toPersistedIssueAssessments(
  assessments: IssueAssessment[],
  titlesByNumber: ReadonlyMap<number, string>,
): PersistedIssueAssessment[] {
  return assessments.flatMap((assessment) => {
    const title = titlesByNumber.get(assessment.issueNumber) ?? `Issue #${assessment.issueNumber}`;
    const candidate = {
      ...assessment,
      title: boundIssueTitle(title),
    };
    const parsed = persistedIssueAssessmentSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parsePersistedIssueAssessments(
  value: unknown,
): PersistedIssueAssessment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = persistedIssueAssessmentSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
