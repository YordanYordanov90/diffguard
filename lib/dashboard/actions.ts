"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { invalidateInstallationAccessCache } from "@/lib/auth/access";

export type ActionResult = {
  success: boolean;
  data: null;
  error: string | null;
};

/**
 * Invalidate the short-lived GitHub installation-access cache and revalidate
 * dashboard routes so Manage-on-GitHub changes become visible promptly.
 */
export async function refreshDashboardCoverage(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, data: null, error: "Unauthorized" };
  }

  try {
    await invalidateInstallationAccessCache(userId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/repositories");
    revalidatePath("/dashboard/reviews");
    revalidatePath("/dashboard/learnings");
    return { success: true, data: null, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: "Coverage could not be refreshed.",
    };
  }
}
