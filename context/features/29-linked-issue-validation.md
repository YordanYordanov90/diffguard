# Feature 29 — Linked GitHub Issue Validation

## Goal

Review whether a pull request appears to satisfy the requirements of explicitly
linked GitHub issues, not only whether its code is locally correct.

## Depends on

23, 24, 28.

## Permission gate

- This feature requires `Issues: read` for private-repository issue content.
  Update the GitHub App configuration only when implementation begins and
  verify GitHub's installation approval flow with the owner before beta rollout.
- Existing installations may need to approve the new permission. DiffGuard
  must continue ordinary code review when permission is missing.
- Request no issue write permission in this feature.

## Scope (do)

- Parse only explicit GitHub closing references from the PR body:
  `fixes`, `closes`, or `resolves` followed by an issue number or GitHub issue
  URL.
- Initial scope is a maximum of three issues in the same repository. Ignore
  casual `#123` mentions, comments, cross-repository issues, Jira, Linear, and
  arbitrary URLs.
- Resolve references server-side and fetch each issue through the installation
  token at review time. Validate the minimal response shape before prompt use.
- Use only the issue title and body. Treat both as bounded, delimited,
  untrusted product context that cannot override review rules or request tools.
- Extend the structured review output with one assessment per allowlisted
  issue: `addressed`, `not_addressed`, or `unclear`, plus a concise rationale
  and bounded unmet-requirement list.
- Validate that every returned issue number was supplied to the model.
  Omitted, inaccessible, closed-as-duplicate, or ambiguous requirements become
  `unclear`, never fabricated.
- Render a compact `Linked requirements` section in the canonical summary.
  Do not create inline comments solely from an issue assessment unless a
  concrete changed line independently qualifies as a code finding.
- Fetch issue context in memory only. Persist the rendered assessment and
  minimal issue metadata needed for review history, never the full issue body.

## Security invariants

- Issue text is an external prompt-injection surface and remains inside
  explicit untrusted delimiters.
- References cannot change repository scope, installation scope, API origin,
  model, output schema, or review instructions.
- Requirement assessment is advisory and cannot approve, request changes, or
  block a merge.

## Out of scope

Issue comments or discussion threads, cross-repository references, external
trackers, issue creation, issue mutation, planning, or merge checks.

## Verification

- Parser tests cover supported closing keywords, casing, duplicate references,
  URLs, casual mentions, malformed inputs, and the three-issue cap.
- Access tests cover missing permission, private issues, inaccessible issues,
  and tenant/repository isolation.
- Prompt-injection fixtures prove issue content cannot change the output
  contract or suppress security review.
- End-to-end verification uses one issue with measurable acceptance criteria
  and confirms addressed, missing, and unclear outcomes.
