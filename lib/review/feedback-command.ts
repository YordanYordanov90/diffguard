import {
  FEEDBACK_COMMAND_MENTION,
  FEEDBACK_REASON_MAX_CHARS,
} from "@/lib/config/constants";

export type FeedbackCommandAction = "valid" | "dismiss" | "false_positive";

export type FeedbackCommand =
  | { action: "valid"; reason: null }
  | { action: "dismiss" | "false_positive"; reason: string };

/**
 * Parse a deterministic DiffGuard feedback command from a review comment body.
 * Free-form or adversarial text returns null and must never mutate state.
 */
export function parseFeedbackCommand(body: string): FeedbackCommand | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const mention = FEEDBACK_COMMAND_MENTION.replace("@", "\\@");
  const validPattern = new RegExp(`^${mention}\\s+valid\\s*$`, "i");
  if (validPattern.test(trimmed)) {
    return { action: "valid", reason: null };
  }

  const reasonCommand = new RegExp(
    `^${mention}\\s+(dismiss|false-positive)\\s*:\\s*([\\s\\S]+)$`,
    "i",
  );
  const match = reasonCommand.exec(trimmed);
  if (!match) return null;

  const rawAction = match[1]?.toLowerCase();
  const reason = match[2]?.trim() ?? "";
  if (!reason || reason.length > FEEDBACK_REASON_MAX_CHARS) return null;

  if (rawAction === "dismiss") {
    return { action: "dismiss", reason };
  }
  if (rawAction === "false-positive") {
    return { action: "false_positive", reason };
  }
  return null;
}

/** Short acknowledgement never includes internal ids or permission details. */
export function feedbackAcknowledgement(action: FeedbackCommandAction): string {
  switch (action) {
    case "valid":
      return "Recorded as useful. Thanks for the signal.";
    case "dismiss":
      return "Finding dismissed.";
    case "false_positive":
      return "Recorded as false positive and dismissed.";
  }
}

export function feedbackActionDismisses(
  action: FeedbackCommandAction,
): boolean {
  return action === "dismiss" || action === "false_positive";
}
