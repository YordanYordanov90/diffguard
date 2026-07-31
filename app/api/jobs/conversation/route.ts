import {
  createConversationWorkerDependencies,
  handleConversationWorker,
} from "@/lib/workers/conversation";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleConversationWorker(
    request,
    createConversationWorkerDependencies(),
  );
}
