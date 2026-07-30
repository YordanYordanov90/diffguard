export const DEBOUNCE_SECONDS = 75;
export const DAILY_REVIEW_CAP = 20;
export const RATE_LIMIT = 10;
export const DIFF_TOKEN_BUDGET = 55_000;
export const INSTRUCTIONS_TOKEN_CAP = 2_000;
export const FULL_FILE_CONTEXT_MAX_FILES = 8;
export const RELATED_CODE_CONTEXT_MAX_FILES = 4;
export const REVIEW_CONTEXT_MAX_FETCHES = FULL_FILE_CONTEXT_MAX_FILES;
export const FULL_FILE_CONTEXT_FILE_BYTE_LIMIT = 16_000;
export const FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT = 4_000;
export const FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT = 64_000;
export const FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT = 16_000;
export const FULL_FILE_CONTEXT_TIMEOUT_MS = 15_000;
export const REVIEW_PROMPT_TOKEN_BUDGET =
  DIFF_TOKEN_BUDGET + INSTRUCTIONS_TOKEN_CAP + FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT;
export const LLM_TIMEOUT_MS = 120_000;
export const REVIEW_OUTPUT_TOKEN_BUDGET = 8_000;
export const ADJUDICATION_OUTPUT_TOKEN_BUDGET = 4_000;
export const INLINE_COMMENT_CAP = 8;
export const INLINE_SUGGESTION_MAX_LINES = 20;
export const INLINE_SUGGESTION_MAX_CHARS = 4_000;
/** Max same-repo closing references assessed per review (Feature 29). */
export const MAX_LINKED_ISSUES = 3;
/** Bounded issue title/body supplied to the model (chars, not tokens). */
export const LINKED_ISSUE_TITLE_CHAR_LIMIT = 500;
export const LINKED_ISSUE_BODY_CHAR_LIMIT = 4_000;
export const DEFAULT_MODEL = "openai/gpt-5.4-mini";
