import {
  createReviewWorkerDependencies,
  handleReviewWorker,
} from "@/lib/workers/review";

export const maxDuration = 300;

export async function POST(request: Request) {
  return handleReviewWorker(request, createReviewWorkerDependencies());
}
