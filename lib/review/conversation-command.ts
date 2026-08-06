import { FEEDBACK_COMMAND_MENTION } from "@/lib/config/constants";

export type ReviewControlAction =
  | "review"
  | "full_review"
  | "pause"
  | "resume";

export type FeedbackRedirectAction =
  | "valid"
  | "dismiss"
  | "false_positive"
  | "remember";

export type ConversationCommand =
  | { kind: "control"; action: ReviewControlAction }
  | { kind: "feedback_redirect"; action: FeedbackRedirectAction }
  | { kind: "question"; question: string }
  | { kind: "empty" };

/**
 * Parse a top-level PR issue comment body after a leading @diffguard mention.
 * Deterministic controls are recognized before any free-form question text.
 */
export function parseConversationCommand(body: string): ConversationCommand {
  const trimmed = body.trim();
  if (!trimmed) return { kind: "empty" };

  const mention = FEEDBACK_COMMAND_MENTION.replace("@", "\\@");
  const prefix = new RegExp(`^${mention}\\s*`, "i");
  if (!prefix.test(trimmed)) return { kind: "empty" };

  const rest = trimmed.replace(prefix, "").trim();
  if (!rest) return { kind: "empty" };

  // Exact control commands (optional trailing punctuation only).
  if (/^review\s*$/i.test(rest) || /^review[.!?]?\s*$/i.test(rest)) {
    return { kind: "control", action: "review" };
  }
  if (/^full\s+review\s*$/i.test(rest) || /^full\s+review[.!?]?\s*$/i.test(rest)) {
    return { kind: "control", action: "full_review" };
  }
  if (/^pause\s*$/i.test(rest) || /^pause[.!?]?\s*$/i.test(rest)) {
    return { kind: "control", action: "pause" };
  }
  if (/^resume\s*$/i.test(rest) || /^resume[.!?]?\s*$/i.test(rest)) {
    return { kind: "control", action: "resume" };
  }

  // Feedback/learning commands belong on inline finding replies (Features 30–31).
  if (/^valid\s*$/i.test(rest)) {
    return { kind: "feedback_redirect", action: "valid" };
  }
  if (/^dismiss\s*:/i.test(rest)) {
    return { kind: "feedback_redirect", action: "dismiss" };
  }
  if (/^false-positive\s*:/i.test(rest)) {
    return { kind: "feedback_redirect", action: "false_positive" };
  }
  if (/^remember\s*:/i.test(rest)) {
    return { kind: "feedback_redirect", action: "remember" };
  }

  // Anything else after the mention is a free-form question.
  return { kind: "question", question: rest.slice(0, 2_000) };
}

/** Write-capable roles required for pause / resume / full review. */
export function controlRequiresWriteAccess(action: ReviewControlAction): boolean {
  return action === "pause" || action === "resume" || action === "full_review";
}

export function controlAcknowledgement(action: ReviewControlAction): string {
  switch (action) {
    case "review":
      return "Queued an incremental review of the current PR head.";
    case "full_review":
      return "Queued a full review of the current PR head.";
    case "pause":
      return "Automatic reviews are paused for this PR. Use `@diffguard resume` to continue.";
    case "resume":
      return "Automatic reviews are resumed for this PR.";
  }
}

export function feedbackRedirectAcknowledgement(
  action: FeedbackRedirectAction,
): string {
  return `The \`${action.replaceAll("_", "-")}\` command only works as a reply to a DiffGuard inline finding, not as a top-level PR comment.`;
}
