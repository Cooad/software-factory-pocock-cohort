import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./preference";

export type ThemeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type ColorSchemeMedia = {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
};

export type ThemeRoot = {
  classList: { toggle(token: string, force?: boolean): boolean };
};

export type ThemeEnvironment = {
  storage: ThemeStorage;
  media: ColorSchemeMedia;
  root: ThemeRoot;
};

export type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

export type ThemeStore = {
  getSnapshot(): ThemeState;
  setPreference(preference: ThemePreference): void;
  subscribe(listener: () => void): () => void;
};

function readStored(storage: ThemeStorage): string | null {
  try {
    return storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(storage: ThemeStorage, preference: ThemePreference): void {
  try {
    if (preference === "system") storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {}
}

export function createThemeStore({
  storage,
  media,
  root,
}: ThemeEnvironment): ThemeStore {
  const listeners = new Set<() => void>();
  let state = computeState(parseThemePreference(readStored(storage)));

  function computeState(preference: ThemePreference): ThemeState {
    return { preference, resolved: resolveTheme(preference, media.matches) };
  }

  function applyTheme(resolved: ResolvedTheme): void {
    root.classList.toggle("dark", resolved === "dark");
  }

  function update(preference: ThemePreference): void {
    const next = computeState(preference);
    applyTheme(next.resolved);
    if (
      next.preference === state.preference &&
      next.resolved === state.resolved
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) listener();
  }

  applyTheme(state.resolved);
  media.addEventListener("change", () => update(state.preference));

  return {
    getSnapshot: () => state,
    setPreference(preference) {
      writeStored(storage, preference);
      update(preference);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
