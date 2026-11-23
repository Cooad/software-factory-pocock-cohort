import { describe, it, expect, vi } from "vitest";
import { createThemeStore, THEME_STORAGE_KEY } from "../index";
import { fakeMedia, fakeRoot, fakeStorage, throwingStorage } from "./fakes";

function setup({
  stored,
  prefersDark,
}: {
  stored?: string;
  prefersDark: boolean;
}) {
  const { storage, items } = fakeStorage(
    stored === undefined ? {} : { [THEME_STORAGE_KEY]: stored }
  );
  const os = fakeMedia(prefersDark);
  const page = fakeRoot();
  const store = createThemeStore({ storage, media: os.media, root: page.root });
  return { store, items, os, page };
}

describe("createThemeStore", () => {
  it("follows the OS when nothing is saved", () => {
    const { store, page } = setup({ prefersDark: true });
    expect(store.getSnapshot()).toEqual({
      preference: "system",
      resolved: "dark",
    });
    expect(page.isDark()).toBe(true);
  });

  it("is light under a light OS when nothing is saved", () => {
    const { store, page } = setup({ prefersDark: false });
    expect(store.getSnapshot()).toEqual({
      preference: "system",
      resolved: "light",
    });
    expect(page.isDark()).toBe(false);
  });

  it("keeps a saved dark choice under a light OS", () => {
    const { store, page } = setup({ stored: "dark", prefersDark: false });
    expect(store.getSnapshot()).toEqual({
      preference: "dark",
      resolved: "dark",
    });
    expect(page.isDark()).toBe(true);
  });

  it("keeps a saved light choice under a dark OS", () => {
    const { store, page } = setup({ stored: "light", prefersDark: true });
    expect(store.getSnapshot()).toEqual({
      preference: "light",
      resolved: "light",
    });
    expect(page.isDark()).toBe(false);
  });

  it("treats an unknown saved value as system", () => {
    const { store } = setup({ stored: "purple", prefersDark: true });
    expect(store.getSnapshot().preference).toBe("system");
  });

  it("follows the OS changing while the page is open", () => {
    const { store, os, page } = setup({ prefersDark: false });
    const listener = vi.fn();
    store.subscribe(listener);

    os.setPrefersDark(true);

    expect(store.getSnapshot().resolved).toBe("dark");
    expect(page.isDark()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores the OS changing when a theme is chosen", () => {
    const { store, os, page } = setup({ stored: "light", prefersDark: false });
    const listener = vi.fn();
    store.subscribe(listener);

    os.setPrefersDark(true);

    expect(store.getSnapshot().resolved).toBe("light");
    expect(page.isDark()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("saves a chosen theme and applies it", () => {
    const { store, items, page } = setup({ prefersDark: false });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPreference("dark");

    expect(items.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(store.getSnapshot()).toEqual({
      preference: "dark",
      resolved: "dark",
    });
    expect(page.isDark()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("forgets the saved choice when switched back to system", () => {
    const { store, items, page } = setup({
      stored: "dark",
      prefersDark: false,
    });

    store.setPreference("system");

    expect(items.has(THEME_STORAGE_KEY)).toBe(false);
    expect(store.getSnapshot()).toEqual({
      preference: "system",
      resolved: "light",
    });
    expect(page.isDark()).toBe(false);
  });

  it("notifies when only the preference changes", () => {
    const { store } = setup({ prefersDark: true });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPreference("dark");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the same snapshot when nothing changes", () => {
    const { store } = setup({ stored: "dark", prefersDark: true });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPreference("dark");

    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const { store } = setup({ prefersDark: false });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setPreference("dark");

    expect(listener).not.toHaveBeenCalled();
  });

  it("still switches theme when storage throws", () => {
    const os = fakeMedia(true);
    const page = fakeRoot();
    const store = createThemeStore({
      storage: throwingStorage(),
      media: os.media,
      root: page.root,
    });
    expect(store.getSnapshot().preference).toBe("system");

    store.setPreference("light");
    expect(store.getSnapshot().resolved).toBe("light");
    store.setPreference("system");
    expect(store.getSnapshot().resolved).toBe("dark");
  });

  it("reads choices saved by the old two-state toggle", () => {
    const { storage } = fakeStorage({ "cadence-theme": "dark" });
    const store = createThemeStore({
      storage,
      media: fakeMedia(false).media,
      root: fakeRoot().root,
    });
    expect(store.getSnapshot().preference).toBe("dark");
  });
});
