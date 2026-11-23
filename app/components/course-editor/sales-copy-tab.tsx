import { useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "../../routes/+types/instructor.$courseId";

type Course = Route.ComponentProps["loaderData"]["course"];
import { MonacoMarkdownEditor } from "~/components/monaco-markdown-editor";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Save } from "lucide-react";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";

export function SalesCopyTab({ course }: { course: Course }) {
  const salesCopyFetcher = useFetcher();
  const [salesCopy, setSalesCopy] = useState<string>(course.salesCopy);
  const salesCopyHasChanges = salesCopy !== course.salesCopy;
  const salesCopyIsEmpty = salesCopy.trim().length === 0;
  useFetcherToast(salesCopyFetcher, "Sales copy saved.");

  function handleSalesCopySave() {
    salesCopyFetcher.submit(
      { intent: "update-sales-copy", salesCopy },
      { method: "post" }
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Sales Copy</h2>
        <p className="text-sm text-muted-foreground">
          Write the course sales copy in Markdown. This is shown on the public
          course page. Press Ctrl+S to format and save.
        </p>
      </CardHeader>
      <CardContent>
        <MonacoMarkdownEditor
          value={salesCopy}
          onChange={setSalesCopy}
          onSave={handleSalesCopySave}
        />
        <div className="mt-4 flex items-center gap-4">
          <Button
            onClick={handleSalesCopySave}
            disabled={
              !salesCopyHasChanges ||
              salesCopyIsEmpty ||
              salesCopyFetcher.state !== "idle"
            }
          >
            <Save className="mr-1.5 size-4" />
            {salesCopyFetcher.state !== "idle"
              ? "Saving..."
              : "Save Sales Copy"}
          </Button>
          <SalesCopyStatus
            isEmpty={salesCopyIsEmpty}
            hasChanges={salesCopyHasChanges}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SalesCopyStatus({
  isEmpty,
  hasChanges,
}: {
  isEmpty: boolean;
  hasChanges: boolean;
}) {
  if (isEmpty) {
    return (
      <span className="text-sm text-destructive">
        Sales copy cannot be empty.
      </span>
    );
  }
  if (!hasChanges) return null;
  return (
    <span className="text-sm text-muted-foreground">
      You have unsaved changes.
    </span>
  );
}
