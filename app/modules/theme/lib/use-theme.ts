import { useSyncExternalStore } from "react";
import { createThemeStore, type Theme, type ThemeStore } from "./store";

let browserStore: ThemeStore | undefined;

function getBrowserStore(): ThemeStore {
  browserStore ??= createThemeStore({
    root: document.documentElement,
    storage: window.localStorage,
  });
  return browserStore;
}

const serverTheme = (): Theme => "light";

export function useBrowserTheme() {
  const theme = useSyncExternalStore(
    (listener) => getBrowserStore().subscribe(listener),
    () => getBrowserStore().getTheme(),
    serverTheme
  );
  return { theme, toggleTheme: () => getBrowserStore().toggleTheme() };
}
