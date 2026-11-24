import { useFetcher } from "react-router";
import { Pencil } from "lucide-react";
import { AddItemForm } from "~/components/course-editor/add-item-form";
import { ConfirmDeleteButton } from "~/components/course-editor/confirm-delete-button";
import { InlineTitleEditor } from "~/components/course-editor/inline-title-editor";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";

export function InlineEditableLessonTitle({
  value,
  lessonId,
}: {
  value: string;
  lessonId: number;
}) {
  const fetcher = useFetcher();

  return (
    <InlineTitleEditor
      value={value}
      onSave={(title) =>
        fetcher.submit(
          { intent: "rename-lesson", lessonId: String(lessonId), title },
          { method: "post" }
        )
      }
      inputClassName="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      buttonClassName="group flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted"
    >
      <span className="flex-1">{value}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </InlineTitleEditor>
  );
}

export function DeleteLessonButton({ lessonId }: { lessonId: number }) {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Lesson deleted.");

  return (
    <ConfirmDeleteButton
      prompt="Delete?"
      size="lesson"
      onConfirm={() =>
        fetcher.submit(
          { intent: "delete-lesson", lessonId: String(lessonId) },
          { method: "post" }
        )
      }
    />
  );
}

export function AddLessonForm({ moduleId }: { moduleId: number }) {
  return (
    <AddItemForm
      item="Lesson"
      fields={{ intent: "add-lesson", moduleId: String(moduleId) }}
    />
  );
}
