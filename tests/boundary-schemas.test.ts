import { describe, expect, it } from "vitest";

import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  issueCommentEventSchema,
  issueCommentIsPullRequest,
  pullRequestEventSchema,
  pullRequestReviewCommentEventSchema,
} from "@/lib/github/events";
import { conversationJobSchema } from "@/lib/review/conversation-job";
import { feedbackJobSchema } from "@/lib/review/feedback-job";
import { reviewJobSchema } from "@/lib/review/job";
import {
  adjudicationOutputSchema,
  candidateReviewOutputSchema,
  reviewOutputSchema,
} from "@/lib/review/schema";

const sha = "0123456789abcdef0123456789abcdef01234567";

describe("GitHub boundary schemas", () => {
  it("parses the supported pull request fields and ignores extra payload data", () => {
    const result = pullRequestEventSchema.parse({
      action: "opened",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo", private: true },
      pull_request: {
        number: 7,
        draft: false,
        title: "Update dependency",
        body: null,
        head: { sha, label: "owner:branch" },
        user: { login: "author", type: "User", id: 9 },
      },
      sender: { login: "github" },
    });

    expect(result.repository).toEqual({ id: 100, full_name: "owner/repo" });
    expect(result.pull_request.head).toEqual({ sha });
    expect("sender" in result).toBe(false);
  });

  it("rejects malformed pull request SHAs and missing fields", () => {
    expect(() =>
      pullRequestEventSchema.parse({
        action: "opened",
        installation: { id: 42 },
        repository: { id: 100, full_name: "owner/repo" },
        pull_request: {
          number: 7,
          draft: false,
          title: "Update dependency",
          body: null,
          head: { sha: "not-a-sha" },
          user: { login: "author", type: "User" },
        },
      }),
    ).toThrow();
  });

  it("parses installation and repository synchronization events", () => {
    expect(
      installationEventSchema.parse({
        action: "created",
        installation: { id: 42, account: { login: "owner", type: "Organization" } },
        repositories: [{ id: 100, full_name: "owner/repo" }],
      }),
    ).toMatchObject({ action: "created", installation: { id: 42 } });

    expect(
      installationRepositoriesEventSchema.parse({
        action: "added",
        installation: { id: 42 },
        repositories_added: [{ id: 100, full_name: "owner/repo" }],
        repositories_removed: [],
      }),
    ).toHaveProperty("repositories_added");
  });

  it("parses pull_request_review_comment feedback fields and strips extras", () => {
    const result = pullRequestReviewCommentEventSchema.parse({
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo", private: true },
      pull_request: {
        number: 7,
        user: { login: "author", type: "User", id: 1 },
        draft: false,
      },
      comment: {
        id: 9001,
        body: "@diffguard dismiss: not relevant",
        user: { login: "reviewer", type: "User" },
        in_reply_to_id: 7001,
        path: "src/auth.ts",
      },
      sender: { login: "reviewer" },
    });

    expect(result).toEqual({
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo" },
      pull_request: {
        number: 7,
        user: { login: "author", type: "User" },
      },
      comment: {
        id: 9001,
        body: "@diffguard dismiss: not relevant",
        user: { login: "reviewer", type: "User" },
        in_reply_to_id: 7001,
      },
    });
  });
});

describe("review boundary schemas", () => {
  it("parses issue_comment events and detects PR issues", () => {
    const prComment = issueCommentEventSchema.parse({
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo" },
      issue: {
        number: 7,
        pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/7" },
        user: { login: "author", type: "User" },
      },
      comment: {
        id: 9001,
        body: "@diffguard hello",
        user: { login: "reviewer", type: "User" },
      },
      sender: { login: "reviewer" },
    });
    expect(issueCommentIsPullRequest(prComment)).toBe(true);

    const issueOnly = issueCommentEventSchema.parse({
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo" },
      issue: {
        number: 8,
        user: { login: "author", type: "User" },
      },
      comment: {
        id: 9002,
        body: "@diffguard hello",
        user: { login: "reviewer", type: "User" },
      },
    });
    expect(issueCommentIsPullRequest(issueOnly)).toBe(false);
  });

  it("parses a valid QStash conversation job", () => {
    expect(
      conversationJobSchema.parse({
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        sourceCommentId: 9001,
        actorLogin: "reviewer",
        prAuthorLogin: "author",
        deliveryId: "delivery-1",
        interactionId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({ sourceCommentId: 9001 });
  });

  it("parses a valid QStash feedback job", () => {
    expect(
      feedbackJobSchema.parse({
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        parentCommentId: 7001,
        sourceCommentId: 9001,
        actorLogin: "reviewer",
        prAuthorLogin: "author",
        action: "false_positive",
        reason: "intentional",
        deliveryId: "delivery-1",
      }),
    ).toMatchObject({ action: "false_positive", reason: "intentional" });
  });

  it("parses a valid QStash review job", () => {
    expect(
      reviewJobSchema.parse({
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        prTitle: "Update dependency",
        prBody: "Please review this change.",
        headSha: sha,
        deliveryId: "delivery-1",
      }),
    ).toMatchObject({
      installationId: 42,
      headSha: sha,
      forceFullReview: false,
    });
  });

  it("accepts the internal forceFullReview override on review jobs", () => {
    expect(
      reviewJobSchema.parse({
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        prTitle: "Update dependency",
        prBody: null,
        headSha: sha,
        deliveryId: "delivery-2",
        forceFullReview: true,
      }),
    ).toMatchObject({ forceFullReview: true });
  });

  it("rejects unsupported LLM enum values", () => {
    expect(() =>
      reviewOutputSchema.parse({
        summary: "Review complete.",
        verdict: "ship-it",
        findings: [],
      }),
    ).toThrow();
  });

  it("requires evidence fields for candidate findings and bounded decisions", () => {
    expect(() => candidateReviewOutputSchema.parse({
      summary: "Candidate",
      verdict: "comment",
      candidates: [{
        severity: "high",
        category: "security",
        file: "src/auth.ts",
        line: 4,
        title: "Unsafe path",
        detail: "A concrete issue.",
        suggestion: null,
        confidence: "high",
        observedBehavior: "Observed behavior.",
        causalPath: "Causal path.",
        violatedInvariant: "Invariant.",
        requiresRuntimeVerification: false,
        suggestedChange: null,
      }],
      linkedIssues: [{
        issueNumber: 12,
        status: "not_addressed",
        rationale: "Missing validation.",
        unmetRequirements: ["Validate email"],
      }],
    })).not.toThrow();

    expect(
      candidateReviewOutputSchema.parse({
        summary: "Candidate",
        verdict: "comment",
        candidates: [],
      }).linkedIssues,
    ).toEqual([]);

    expect(() => candidateReviewOutputSchema.parse({
      summary: "Candidate",
      verdict: "comment",
      candidates: [{
        severity: "high",
        category: "security",
        file: "src/auth.ts",
        line: 4,
        title: "Unsafe path",
        detail: "A concrete issue.",
        suggestion: null,
        confidence: "high",
        observedBehavior: "",
        causalPath: "Causal path.",
        violatedInvariant: "Invariant.",
        requiresRuntimeVerification: false,
        suggestedChange: null,
      }],
    })).toThrow();

    expect(() => adjudicationOutputSchema.parse({
      summary: "Confirmed one issue.",
      verdict: "concerns",
      decisions: [{ candidateId: "candidate-1", decision: "confirmed", reason: "Evidence." }],
    })).not.toThrow();
  });
});
