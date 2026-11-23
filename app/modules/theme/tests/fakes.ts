import type { ColorSchemeMedia, ThemeRoot, ThemeStorage } from "../index";

export function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: ThemeStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { storage, items };
}

export function throwingStorage(): ThemeStorage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

export function fakeMedia(prefersDark: boolean) {
  const listeners: Array<() => void> = [];
  const media: ColorSchemeMedia = {
    matches: prefersDark,
    addEventListener: (type, listener) => {
      if (type === "change") listeners.push(listener);
    },
  };
  return {
    media,
    setPrefersDark(next: boolean) {
      (media as { matches: boolean }).matches = next;
      for (const listener of listeners) listener();
    },
  };
}

export function fakeRoot() {
  const classes = new Set<string>();
  const root: ThemeRoot = {
    classList: {
      toggle(token, force) {
        const on = force ?? !classes.has(token);
        if (on) classes.add(token);
        else classes.delete(token);
        return on;
      },
    },
  };
  return { root, isDark: () => classes.has("dark") };
}
