import { useEffect, useSyncExternalStore } from "react";
import { DARK_SCHEME_QUERY, type ThemePreference } from "./lib/preference";
import { createLazyThemeStore, SERVER_THEME_STATE } from "./lib/lazy-store";
import type { ThemeState, ThemeStorage } from "./lib/store";

const browserStorage: ThemeStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

const browserTheme = createLazyThemeStore(() => ({
  storage: browserStorage,
  media: window.matchMedia(DARK_SCHEME_QUERY),
  root: document.documentElement,
}));

const getServerSnapshot = () => SERVER_THEME_STATE;

export function useTheme(): ThemeState & {
  setPreference: (preference: ThemePreference) => void;
} {
  const state = useSyncExternalStore(
    browserTheme.subscribe,
    browserTheme.getSnapshot,
    getServerSnapshot
  );
  return { ...state, setPreference: browserTheme.setPreference };
}

export function useStartTheme(): void {
  useEffect(() => browserTheme.start(), []);
}
