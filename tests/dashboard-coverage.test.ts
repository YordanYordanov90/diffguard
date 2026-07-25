import { describe, expect, it } from "vitest";

import {
  buildOverviewModel,
  deriveRepositoryCoverage,
  formatCoverageDetail,
  formatRelativeTime,
  repositorySelectionLabel,
  sortCoverageRepositories,
} from "@/lib/dashboard/coverage";
import type { AccessibleInstallation } from "@/lib/github/accessible-installation";
import type { DashboardReview } from "@/lib/dashboard/types";

const installations: AccessibleInstallation[] = [
  {
    id: 10,
    account: { login: "YordanYordanov90", type: "User" },
    repository_selection: "all",
    html_url: "https://github.com/settings/installations/10",
    suspended_at: null,
  },
  {
    id: 20,
    account: { login: "example-org", type: "Organization" },
    repository_selection: "selected",
    html_url: "https://github.com/organizations/example-org/settings/installations/20",
    suspended_at: "2026-07-20T00:00:00Z",
  },
];

const repositories = [
  { id: 1, installationId: 10, fullName: "YordanYordanov90/diffguard", enabled: true },
  { id: 2, installationId: 10, fullName: "YordanYordanov90/weather-app", enabled: true },
  { id: 3, installationId: 10, fullName: "YordanYordanov90/portfolio", enabled: true },
  { id: 4, installationId: 20, fullName: "example-org/api", enabled: true },
];

const now = new Date("2026-07-25T12:00:00.000Z");

describe("dashboard coverage read model", () => {
  it("maps repository_selection to exact UI vocabulary", () => {
    expect(repositorySelectionLabel("all")).toBe("All repositories");
    expect(repositorySelectionLabel("selected")).toBe("Selected repositories");
  });

  it("treats no reviews as awaiting first review, not attention", () => {
    const coverage = deriveRepositoryCoverage(undefined, false);
    expect(coverage).toEqual({
      label: "Awaiting first review",
      detail: null,
      attention: false,
      latestReviewedAt: null,
    });
  });

  it("flags failed and concerns reviews as attention", () => {
    expect(
      deriveRepositoryCoverage(
        {
          repositoryId: 1,
          installationId: 10,
          status: "failed",
          verdict: null,
          updatedAt: now,
          createdAt: now,
        },
        false,
      ),
    ).toMatchObject({ label: "Review failed", attention: true });

    expect(
      deriveRepositoryCoverage(
        {
          repositoryId: 1,
          installationId: 10,
          status: "completed",
          verdict: "concerns",
          updatedAt: now,
          createdAt: now,
        },
        false,
      ),
    ).toMatchObject({ label: "Needs attention", attention: true });

    expect(
      deriveRepositoryCoverage(
        {
          repositoryId: 1,
          installationId: 10,
          status: "completed",
          verdict: "approve",
          updatedAt: now,
          createdAt: now,
        },
        false,
      ),
    ).toMatchObject({ label: "Reviewed", attention: false });
  });

  it("marks every repository under a suspended installation as attention", () => {
    const coverage = deriveRepositoryCoverage(
      {
        repositoryId: 4,
        installationId: 20,
        status: "completed",
        verdict: "approve",
        updatedAt: now,
        createdAt: now,
      },
      true,
    );
    expect(coverage.attention).toBe(true);
    expect(coverage.detail).toBe("Installation suspended");
  });

  it("sorts attention, then awaiting, then name", () => {
    const sorted = sortCoverageRepositories([
      {
        repositoryId: 2,
        fullName: "owner/b",
        label: "Reviewed",
        detail: null,
        attention: false,
        latestReviewedAt: null,
      },
      {
        repositoryId: 3,
        fullName: "owner/c",
        label: "Awaiting first review",
        detail: null,
        attention: false,
        latestReviewedAt: null,
      },
      {
        repositoryId: 1,
        fullName: "owner/a",
        label: "Review failed",
        detail: null,
        attention: true,
        latestReviewedAt: null,
      },
    ]);
    expect(sorted.map((row) => row.fullName)).toEqual([
      "owner/a",
      "owner/c",
      "owner/b",
    ]);
  });

  it("builds multi-installation summary counts and coverage groups", () => {
    const model = buildOverviewModel({
      installations,
      repositories,
      latestReviews: [
        {
          repositoryId: 1,
          installationId: 10,
          status: "completed",
          verdict: "comment",
          updatedAt: new Date("2026-07-25T11:58:00.000Z"),
          createdAt: new Date("2026-07-25T11:57:00.000Z"),
        },
        {
          repositoryId: 3,
          installationId: 10,
          status: "failed",
          verdict: null,
          updatedAt: new Date("2026-07-25T10:00:00.000Z"),
          createdAt: new Date("2026-07-25T09:59:00.000Z"),
        },
      ],
      reviewsToday: 2,
      recentReviews: [] as DashboardReview[],
    });

    expect(model.summary).toEqual({
      installationCount: 2,
      repositoryCount: 4,
      reviewsToday: 2,
      attentionCount: 2, // portfolio failed + api under suspended install
    });

    const userGroup = model.groups.find((g) => g.accountLogin === "YordanYordanov90");
    const orgGroup = model.groups.find((g) => g.accountLogin === "example-org");

    expect(userGroup?.repositorySelectionLabel).toBe("All repositories");
    expect(userGroup?.installationState).toBe("Active");
    expect(userGroup?.repositories.map((r) => r.fullName)).toEqual([
      "YordanYordanov90/portfolio",
      "YordanYordanov90/weather-app",
      "YordanYordanov90/diffguard",
    ]);
    expect(
      userGroup?.repositories.find((r) => r.fullName.endsWith("weather-app"))?.label,
    ).toBe("Awaiting first review");
    expect(
      userGroup?.repositories.find((r) => r.fullName.endsWith("portfolio"))?.label,
    ).toBe("Review failed");

    expect(orgGroup?.repositorySelectionLabel).toBe("Selected repositories");
    expect(orgGroup?.installationState).toBe("Suspended");
    expect(orgGroup?.attentionCount).toBe(1);
    expect(orgGroup?.repositories[0]?.detail).toBe("Installation suspended");
  });

  it("formats relative coverage detail without decorative analytics labels", () => {
    expect(formatRelativeTime("2026-07-25T11:58:00.000Z", now)).toBe("2m ago");
    expect(
      formatCoverageDetail(
        {
          label: "Reviewed",
          detail: null,
          latestReviewedAt: "2026-07-25T11:58:00.000Z",
        },
        now,
      ),
    ).toBe("Reviewed 2m ago");
    expect(
      formatCoverageDetail({
        label: "Awaiting first review",
        detail: null,
        latestReviewedAt: null,
      }),
    ).toBe("Awaiting first review");
  });

  it("never trusts client-supplied installation scope in the pure builder", () => {
    // Only installations passed from GitHub access resolution appear.
    const model = buildOverviewModel({
      installations: [installations[0]!],
      repositories,
      latestReviews: [],
      reviewsToday: 0,
      recentReviews: [],
    });
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.installationId).toBe(10);
    // Repo for installation 20 is ignored because that installation was not authorized.
    expect(model.summary.repositoryCount).toBe(3);
  });
});
