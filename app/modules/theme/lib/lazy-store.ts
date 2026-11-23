import {
  createThemeStore,
  type ThemeEnvironment,
  type ThemeState,
  type ThemeStore,
} from "./store";

export const SERVER_THEME_STATE: ThemeState = {
  preference: "system",
  resolved: "light",
};

export type LazyThemeStore = ThemeStore & {
  start(): void;
};

/**
 * A theme store that touches the page only once something starts it: an
 * effect, a subscription or a click. Until then it reports the server state,
 * so React can call `getSnapshot` during render with no side effect.
 */
export function createLazyThemeStore(
  environment: () => ThemeEnvironment
): LazyThemeStore {
  let store: ThemeStore | null = null;

  function started(): ThemeStore {
    store ??= createThemeStore(environment());
    return store;
  }

  return {
    start: () => void started(),
    getSnapshot: () => store?.getSnapshot() ?? SERVER_THEME_STATE,
    setPreference: (preference) => started().setPreference(preference),
    subscribe: (listener) => started().subscribe(listener),
  };
}
