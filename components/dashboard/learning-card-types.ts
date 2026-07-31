import type { DashboardLearning } from "@/lib/dashboard/learnings";

export type ConfirmKind = "archive" | "reactivate";

export type LearningCardProps = {
  learning: DashboardLearning;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  isPending: boolean;
  confirm: ConfirmKind | null;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRequestArchive: () => void;
  onRequestReactivate: () => void;
  onCancelConfirm: () => void;
  onConfirmArchive: () => void;
  onConfirmReactivate: () => void;
};
