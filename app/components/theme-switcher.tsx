import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "~/lib/utils";
import { THEME_PREFERENCES, type ThemePreference } from "~/modules/theme";
import { useTheme } from "~/modules/theme/use-theme";

const OPTIONS: Record<ThemePreference, { label: string; icon: typeof Sun }> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  system: { label: "System", icon: Monitor },
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border p-0.5",
        className
      )}
    >
      <legend className="sr-only">Theme</legend>
      {THEME_PREFERENCES.map((option) => {
        const { label, icon: Icon } = OPTIONS[option];
        const selected = option === preference;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(option)}
            className={cn(
              "flex flex-1 items-center justify-center rounded px-2 py-1 text-muted-foreground transition-colors hover:text-foreground",
              selected && "bg-accent text-accent-foreground"
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </fieldset>
  );
}
