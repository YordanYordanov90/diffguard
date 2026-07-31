import {
  createFeedbackWorkerDependencies,
  handleFeedbackWorker,
} from "@/lib/workers/feedback";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleFeedbackWorker(request, createFeedbackWorkerDependencies());
}
