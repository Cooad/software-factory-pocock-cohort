import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Plus } from "lucide-react";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";

type Item = "Module" | "Lesson";

const styles = {
  Module: {
    open: { variant: "outline", className: "mt-4", icon: "mr-1.5 size-4" },
    row: "mt-4",
    input: "max-w-xs",
    button: undefined,
  },
  Lesson: {
    open: {
      variant: "ghost",
      className: "mt-2 text-muted-foreground",
      icon: "mr-1 size-3.5",
    },
    row: "mt-2",
    input: "max-w-xs text-sm",
    button: "h-8",
  },
} as const;

/**
 * An "Add Module" or "Add Lesson" button that opens a title field. Posts
 * `fields` with the title and closes once the server accepts it.
 */
export function AddItemForm({
  item,
  fields,
}: {
  item: Item;
  fields: Record<string, string>;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const fetcher = useFetcher();
  const style = styles[item];

  useFetcherToast(fetcher, `${item} added.`, () => setIsAdding(false));

  if (!isAdding) {
    return (
      <Button
        variant={style.open.variant}
        size="sm"
        onClick={() => setIsAdding(true)}
        className={style.open.className}
      >
        <Plus className={style.open.icon} />
        Add {item}
      </Button>
    );
  }

  return (
    <AddItemRow
      item={item}
      onAdd={(title) =>
        fetcher.submit({ ...fields, title }, { method: "post" })
      }
      onCancel={() => setIsAdding(false)}
    />
  );
}

function AddItemRow({
  item,
  onAdd,
  onCancel,
}: {
  item: Item;
  onAdd: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const style = styles[item];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed) onAdd(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${style.row} flex items-center gap-2`}
    >
      <Input
        ref={inputRef}
        type="text"
        placeholder={`${item} title...`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        className={style.input}
      />
      <AddItemButtons
        className={style.button}
        canAdd={title.trim() !== ""}
        onCancel={onCancel}
      />
    </form>
  );
}

function AddItemButtons({
  className,
  canAdd,
  onCancel,
}: {
  className: string | undefined;
  canAdd: boolean;
  onCancel: () => void;
}) {
  return (
    <>
      <Button size="sm" type="submit" className={className} disabled={!canAdd}>
        Add
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </>
  );
}
