"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDashboardAccess } from "@/lib/auth/access";
import { getSignedInGitHubLogin } from "@/lib/auth/github-identity";
import { LEARNING_GUIDANCE_MAX_CHARS } from "@/lib/config/constants";
import {
  archiveRepositoryLearning,
  getRepositoryLearningByIdForInstallations,
  reactivateRepositoryLearning,
  updateRepositoryLearningGuidance,
} from "@/lib/db/queries";
import { getCollaboratorPermission } from "@/lib/github/client";

export type LearningActionResult<T = null> = {
  success: boolean;
  data: T;
  error: string | null;
};

const learningIdSchema = z.string().uuid();

const editLearningSchema = z.object({
  learningId: learningIdSchema,
  guidance: z.string().min(1).max(LEARNING_GUIDANCE_MAX_CHARS),
});

const learningIdOnlySchema = z.object({
  learningId: learningIdSchema,
});

const WRITE_PERMISSIONS = new Set(["admin", "maintain", "write"]);

async function authorizeLearningMutation(learningId: string) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return {
        ok: false as const,
        error: "Unauthorized",
      };
    }

    const access = await getDashboardAccess();
    if (access.status === "github-authorization-required") {
      return {
        ok: false as const,
        error: "GitHub authorization is required.",
      };
    }

    const learning = await getRepositoryLearningByIdForInstallations(
      learningId,
      access.installationIds,
    );
    if (!learning) {
      return {
        ok: false as const,
        error: "Learning not found.",
      };
    }

    const actorLogin = await getSignedInGitHubLogin();
    if (!actorLogin) {
      return {
        ok: false as const,
        error: "GitHub identity is required to change learnings.",
      };
    }

    let permission: string;
    try {
      // GitHub exposes no permission-version token. Keep this check immediately
      // before the tenant/repository-scoped mutation; the query reasserts both ids.
      permission = await getCollaboratorPermission(
        learning.installationId,
        learning.repositoryFullName,
        actorLogin,
      );
    } catch {
      return {
        ok: false as const,
        error: "Repository permission could not be verified.",
      };
    }

    if (!WRITE_PERMISSIONS.has(permission)) {
      return {
        ok: false as const,
        error: "You need write access on this repository to change learnings.",
      };
    }

    return {
      ok: true as const,
      learning,
      actorLogin,
    };
  } catch {
    return {
      ok: false as const,
      error: "Authorization could not be verified.",
    };
  }
}

function revalidateLearnings() {
  revalidatePath("/dashboard/learnings");
}

/**
 * Edit learning guidance text. Tenant scope and permission are re-checked
 * server-side; client-supplied installation/repository ids are ignored.
 */
export async function editRepositoryLearningAction(input: {
  learningId: string;
  guidance: string;
}): Promise<LearningActionResult> {
  const parsed = editLearningSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: "Enter a preference up to 500 characters.",
    };
  }

  const authz = await authorizeLearningMutation(parsed.data.learningId);
  if (!authz.ok) {
    return { success: false, data: null, error: authz.error };
  }

  try {
    const result = await updateRepositoryLearningGuidance(
      authz.learning.installationId,
      authz.learning.repositoryId,
      authz.learning.id,
      parsed.data.guidance,
      authz.actorLogin,
    );

    if (result.status === "invalid_guidance") {
      return {
        success: false,
        data: null,
        error: "Enter a preference up to 500 characters.",
      };
    }
    if (result.status === "duplicate") {
      return {
        success: false,
        data: null,
        error: "An equivalent preference already exists for this repository.",
      };
    }
    if (result.status === "not_found") {
      return { success: false, data: null, error: "Learning not found." };
    }

    revalidateLearnings();
    return { success: true, data: null, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: "The learning could not be updated.",
    };
  }
}

export async function archiveRepositoryLearningAction(input: {
  learningId: string;
}): Promise<LearningActionResult> {
  const parsed = learningIdOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, data: null, error: "Invalid learning." };
  }

  const authz = await authorizeLearningMutation(parsed.data.learningId);
  if (!authz.ok) {
    return { success: false, data: null, error: authz.error };
  }

  try {
    const learning = await archiveRepositoryLearning(
      authz.learning.installationId,
      authz.learning.repositoryId,
      authz.learning.id,
      { actorLogin: authz.actorLogin },
    );

    if (!learning) {
      // Idempotent: already archived or missing.
      revalidateLearnings();
      return { success: true, data: null, error: null };
    }

    revalidateLearnings();
    return { success: true, data: null, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: "The learning could not be archived.",
    };
  }
}

export async function reactivateRepositoryLearningAction(input: {
  learningId: string;
}): Promise<LearningActionResult> {
  const parsed = learningIdOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, data: null, error: "Invalid learning." };
  }

  const authz = await authorizeLearningMutation(parsed.data.learningId);
  if (!authz.ok) {
    return { success: false, data: null, error: authz.error };
  }

  try {
    const result = await reactivateRepositoryLearning(
      authz.learning.installationId,
      authz.learning.repositoryId,
      authz.learning.id,
      { actorLogin: authz.actorLogin },
    );

    if (result.status === "quota_exceeded") {
      return {
        success: false,
        data: null,
        error: "This repository has reached the active learning limit.",
      };
    }
    if (
      result.status === "not_found" ||
      result.status === "already_active"
    ) {
      // Idempotent if already active or the row was concurrently reactivated.
      revalidateLearnings();
      return { success: true, data: null, error: null };
    }

    revalidateLearnings();
    return { success: true, data: null, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: "The learning could not be reactivated.",
    };
  }
}
