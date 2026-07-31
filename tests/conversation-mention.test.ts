import { describe, expect, it } from "vitest";

import { CONVERSATION_THREAD_BODY_CHAR_LIMIT } from "@/lib/config/constants";
import {
  boundThreadComments,
  CONVERSATION_BOUNDARY_ACK,
  isDiffguardConversationMention,
} from "@/lib/review/conversation-mention";

describe("isDiffguardConversationMention", () => {
  it("accepts explicit leading mentions", () => {
    expect(isDiffguardConversationMention("@diffguard explain auth")).toBe(true);
    expect(isDiffguardConversationMention("  @DiffGuard full review")).toBe(true);
    expect(isDiffguardConversationMention("@diffguard")).toBe(true);
  });

  it("rejects non-leading and unrelated text", () => {
    expect(isDiffguardConversationMention("please @diffguard help")).toBe(false);
    expect(isDiffguardConversationMention("looks good")).toBe(false);
    expect(isDiffguardConversationMention("@diffguardian")).toBe(false);
    expect(isDiffguardConversationMention("")).toBe(false);
  });

  it("never embeds question text in the boundary ack", () => {
    expect(CONVERSATION_BOUNDARY_ACK).not.toMatch(/explain|question|prompt/i);
  });
});

describe("boundThreadComments", () => {
  it("truncates bodies and never grows unbounded", () => {
    const long = "x".repeat(CONVERSATION_THREAD_BODY_CHAR_LIMIT + 50);
    const bounded = boundThreadComments([
      { id: 1, body: long, userLogin: "a" },
      { id: 2, body: "short", userLogin: "b" },
    ]);
    expect(bounded[0]?.body.length).toBe(CONVERSATION_THREAD_BODY_CHAR_LIMIT);
    expect(bounded[1]?.body).toBe("short");
  });
});
