import { useFetcher } from "react-router";
import { Pencil } from "lucide-react";
import { AddItemForm } from "~/components/course-editor/add-item-form";
import { ConfirmDeleteButton } from "~/components/course-editor/confirm-delete-button";
import { InlineTitleEditor } from "~/components/course-editor/inline-title-editor";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";

export function InlineEditableModuleTitle({
  value,
  moduleId,
}: {
  value: string;
  moduleId: number;
}) {
  const fetcher = useFetcher();

  return (
    <InlineTitleEditor
      value={value}
      onSave={(title) =>
        fetcher.submit(
          { intent: "rename-module", moduleId: String(moduleId), title },
          { method: "post" }
        )
      }
      inputClassName="w-full rounded-md border border-input bg-background px-2 py-1 text-base font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      buttonClassName="group flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted"
    >
      <h3 className="font-semibold">{value}</h3>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </InlineTitleEditor>
  );
}

export function DeleteModuleButton({
  moduleId,
  moduleTitle,
}: {
  moduleId: number;
  moduleTitle: string;
}) {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Module deleted.");

  return (
    <ConfirmDeleteButton
      prompt={`Delete "${moduleTitle}"?`}
      size="module"
      onConfirm={() =>
        fetcher.submit(
          { intent: "delete-module", moduleId: String(moduleId) },
          { method: "post" }
        )
      }
    />
  );
}

export function AddModuleForm() {
  return <AddItemForm item="Module" fields={{ intent: "add-module" }} />;
}
