import {
  CONVERSATION_THREAD_BODY_CHAR_LIMIT,
  CONVERSATION_THREAD_COMMENT_CAP,
  FEEDBACK_COMMAND_MENTION,
} from "@/lib/config/constants";

/**
 * True when a top-level PR comment is directed at DiffGuard.
 * Requires the mention at the start of the trimmed body (Feature 33).
 */
export function isDiffguardConversationMention(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  // Case-insensitive @diffguard at start, then whitespace, end, or punctuation.
  return new RegExp(
    `^${FEEDBACK_COMMAND_MENTION.replace("@", "\\@")}(?:\\s|$|[^a-z0-9_-])`,
    "i",
  ).test(trimmed);
}

/**
 * Short boundary acknowledgement — never includes question text, internal ids,
 * or permission details. Feature 34 will replace this with real answers.
 */
export const CONVERSATION_BOUNDARY_ACK =
  "Received. DiffGuard conversation answers are not enabled yet; automatic reviews are unchanged.";

/**
 * Load bounded thread context from GitHub and discard after use.
 * Bodies are truncated in memory; nothing is persisted or logged.
 */
export function boundThreadComments(
  comments: { id: number; body: string; userLogin: string }[],
): { id: number; body: string; userLogin: string }[] {
  return comments.slice(-CONVERSATION_THREAD_COMMENT_CAP).map((comment) => ({
    id: comment.id,
    userLogin: comment.userLogin,
    body:
      comment.body.length > CONVERSATION_THREAD_BODY_CHAR_LIMIT
        ? comment.body.slice(0, CONVERSATION_THREAD_BODY_CHAR_LIMIT)
        : comment.body,
  }));
}
