export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cadence-theme";

export type ThemeEnvironment = {
  root: { classList: Pick<DOMTokenList, "contains" | "toggle"> };
  storage: Pick<Storage, "setItem">;
};

export type ThemeStore = {
  getTheme(): Theme;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  subscribe(listener: () => void): () => void;
};

export function createThemeStore(env: ThemeEnvironment): ThemeStore {
  const listeners = new Set<() => void>();

  function getTheme(): Theme {
    return env.root.classList.contains("dark") ? "dark" : "light";
  }

  function setTheme(theme: Theme) {
    env.root.classList.toggle("dark", theme === "dark");
    try {
      env.storage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the class still applies.
    }
    for (const listener of listeners) listener();
  }

  return {
    getTheme,
    setTheme,
    toggleTheme: () => setTheme(getTheme() === "dark" ? "light" : "dark"),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
