import {
  createThemeStore as create,
  THEME_STORAGE_KEY as KEY,
  type ThemeEnvironment,
  type ThemeStore,
} from "./lib/store";
import { useBrowserTheme } from "./lib/use-theme";

export type { Theme, ThemeEnvironment, ThemeStore } from "./lib/store";

/** The localStorage key that remembers the app's light or dark theme. */
export const THEME_STORAGE_KEY = KEY;

/**
 * The app's theme lives on `<html class="dark">`. A store reads it from there
 * and tells subscribers when it changes, so every component sees one theme.
 */
export function createThemeStore(env: ThemeEnvironment): ThemeStore {
  return create(env);
}

/** The current app theme, and a toggle, shared by every component. */
export function useTheme() {
  return useBrowserTheme();
}
