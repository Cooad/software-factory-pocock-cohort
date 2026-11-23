import { describe, it, expect, vi } from "vitest";
import { createThemeStore, THEME_STORAGE_KEY } from "../index";

function fakeRoot(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    },
  };
}

function fakeStorage() {
  const items = new Map<string, string>();
  return { items, setItem: (k: string, v: string) => void items.set(k, v) };
}

describe("theme store", () => {
  it("reads light when <html> has no dark class", () => {
    expect(
      createThemeStore({ root: fakeRoot(), storage: fakeStorage() }).getTheme()
    ).toBe("light");
  });

  it("reads dark when <html> has the dark class", () => {
    expect(
      createThemeStore({
        root: fakeRoot(["dark"]),
        storage: fakeStorage(),
      }).getTheme()
    ).toBe("dark");
  });

  it("setTheme puts the class on <html> and remembers the choice", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    const store = createThemeStore({ root, storage });

    store.setTheme("dark");
    expect(root.classes.has("dark")).toBe(true);
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(store.getTheme()).toBe("dark");

    store.setTheme("light");
    expect(root.classes.has("dark")).toBe(false);
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("light");
  });

  it("toggleTheme flips between light and dark", () => {
    const storage = fakeStorage();
    const store = createThemeStore({ root: fakeRoot(), storage });
    store.toggleTheme();
    expect(store.getTheme()).toBe("dark");
    store.toggleTheme();
    expect(store.getTheme()).toBe("light");
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("light");
  });

  it("tells subscribers when the theme changes, until they unsubscribe", () => {
    const store = createThemeStore({
      root: fakeRoot(),
      storage: fakeStorage(),
    });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.toggleTheme();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.toggleTheme();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("still applies the theme when storage throws", () => {
    const root = fakeRoot();
    const store = createThemeStore({
      root,
      storage: {
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    store.setTheme("dark");
    expect(store.getTheme()).toBe("dark");
  });

  it("uses the key the boot script reads", () => {
    expect(THEME_STORAGE_KEY).toBe("cadence-theme");
  });
});
