import { useEffect, useSyncExternalStore } from "react";
import { DARK_SCHEME_QUERY, type ThemePreference } from "./lib/preference";
import {
  createThemeStore,
  type ThemeState,
  type ThemeStorage,
  type ThemeStore,
} from "./lib/store";

const SERVER_STATE: ThemeState = { preference: "system", resolved: "light" };

let browserStore: ThemeStore | null = null;

const browserStorage: ThemeStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

function getBrowserStore(): ThemeStore {
  browserStore ??= createThemeStore({
    storage: browserStorage,
    media: window.matchMedia(DARK_SCHEME_QUERY),
    root: document.documentElement,
  });
  return browserStore;
}

const subscribe = (listener: () => void) =>
  getBrowserStore().subscribe(listener);
const getSnapshot = () => getBrowserStore().getSnapshot();
const getServerSnapshot = () => SERVER_STATE;

export function useTheme(): ThemeState & {
  setPreference: (preference: ThemePreference) => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...state,
    setPreference: (preference) => getBrowserStore().setPreference(preference),
  };
}

export function useFollowSystemTheme(): void {
  useEffect(() => {
    getBrowserStore();
  }, []);
}
