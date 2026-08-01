import { describe, expect, it } from "vitest";

import {
  controlRequiresWriteAccess,
  parseConversationCommand,
} from "@/lib/review/conversation-command";

describe("parseConversationCommand", () => {
  it("parses deterministic review controls", () => {
    expect(parseConversationCommand("@diffguard review")).toEqual({
      kind: "control",
      action: "review",
    });
    expect(parseConversationCommand("@DiffGuard full review")).toEqual({
      kind: "control",
      action: "full_review",
    });
    expect(parseConversationCommand("@diffguard pause")).toEqual({
      kind: "control",
      action: "pause",
    });
    expect(parseConversationCommand("@diffguard resume")).toEqual({
      kind: "control",
      action: "resume",
    });
  });

  it("redirects feedback/learning commands to Features 30–31", () => {
    expect(parseConversationCommand("@diffguard valid")).toEqual({
      kind: "feedback_redirect",
      action: "valid",
    });
    expect(parseConversationCommand("@diffguard dismiss: noise")).toEqual({
      kind: "feedback_redirect",
      action: "dismiss",
    });
    expect(
      parseConversationCommand("@diffguard false-positive: intentional"),
    ).toEqual({
      kind: "feedback_redirect",
      action: "false_positive",
    });
    expect(parseConversationCommand("@diffguard remember: prefer REST")).toEqual({
      kind: "feedback_redirect",
      action: "remember",
    });
  });

  it("treats free-form text as a question", () => {
    expect(
      parseConversationCommand("@diffguard explain the auth risk"),
    ).toEqual({
      kind: "question",
      question: "explain the auth risk",
    });
  });

  it("requires write access for pause, resume, and full review only", () => {
    expect(controlRequiresWriteAccess("review")).toBe(false);
    expect(controlRequiresWriteAccess("full_review")).toBe(true);
    expect(controlRequiresWriteAccess("pause")).toBe(true);
    expect(controlRequiresWriteAccess("resume")).toBe(true);
  });
});
