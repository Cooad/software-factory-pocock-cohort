import { useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Trash2 } from "lucide-react";

const sizes = {
  module: { button: "h-7", trash: "h-7 w-7", icon: "size-4" },
  lesson: { button: "h-6", trash: "h-6 w-6", icon: "size-3.5" },
};

/** A trash button that asks before it calls `onConfirm`. */
export function ConfirmDeleteButton({
  prompt,
  size,
  onConfirm,
}: {
  prompt: ReactNode;
  size: keyof typeof sizes;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const classes = sizes[size];

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive">{prompt}</span>
        <Button
          variant="destructive"
          size="sm"
          className={`${classes.button} text-xs`}
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
        >
          Confirm
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${classes.button} text-xs`}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`${classes.trash} p-0 text-muted-foreground hover:text-destructive`}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className={classes.icon} />
    </Button>
  );
}
