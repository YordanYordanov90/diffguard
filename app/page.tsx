import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * No marketing landing. Home is auth:
 * signed-out → Clerk sign-in (catch-all route), signed-in → dashboard.
 * SignIn must live on /sign-in/[[...sign-in]] (path routing), not bare "/".
 */
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }
  redirect("/sign-in");
}
