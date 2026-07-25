import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { githubAppAuth } from "@/lib/auth/github-app";

function failure(message: string, status: number) {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status },
  );
}

function isSafeReturnPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return failure("GitHub authorization was incomplete.", 400);

  const client = githubAppAuth();
  const pending = await client.consumeState(state);
  if (!pending) return failure("GitHub authorization expired or was invalid.", 400);

  const { userId } = await auth();
  if (!userId || userId !== pending.userId) {
    return failure("The GitHub authorization session does not match the signed-in user.", 401);
  }

  try {
    await client.authorizeCode(userId, code);
  } catch {
    return failure("GitHub authorization could not be completed.", 502);
  }

  if (!isSafeReturnPath(pending.returnTo)) {
    return failure("The authorization return path was invalid.", 400);
  }

  const destination = new URL(pending.returnTo, url.origin);
  if (destination.origin !== url.origin) {
    return failure("The authorization return path was invalid.", 400);
  }

  return NextResponse.redirect(destination);
}
