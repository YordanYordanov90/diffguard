import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { githubAppAuth } from "@/lib/auth/github-app";

function isSafeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const requestedReturnTo = new URL(request.url).searchParams.get("returnTo");
  const returnTo = requestedReturnTo ?? "/dashboard";
  if (!isSafeReturnPath(returnTo)) {
    return NextResponse.json(
      { success: false, data: null, error: "Invalid return path." },
      { status: 400 },
    );
  }

  const client = githubAppAuth();
  const state = await client.createState(userId, returnTo);
  return NextResponse.redirect(client.authorizationUrl(state));
}
