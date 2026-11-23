import { describe, it, expect, vi } from "vitest";
import { createLazyThemeStore, SERVER_THEME_STATE } from "../index";
import { fakeMedia, fakeRoot, fakeStorage } from "./fakes";

function setup() {
  const page = fakeRoot();
  const environment = vi.fn(() => ({
    storage: fakeStorage().storage,
    media: fakeMedia(true).media,
    root: page.root,
  }));
  return { store: createLazyThemeStore(environment), environment, page };
}

describe("createLazyThemeStore", () => {
  it("reports the server state without touching the page until started", () => {
    const { store, environment, page } = setup();

    expect(store.getSnapshot()).toBe(SERVER_THEME_STATE);
    expect(SERVER_THEME_STATE).toEqual({
      preference: "system",
      resolved: "light",
    });
    expect(environment).not.toHaveBeenCalled();
    expect(page.isDark()).toBe(false);
  });

  it("applies the theme once started", () => {
    const { store, page } = setup();

    store.start();

    expect(store.getSnapshot()).toEqual({
      preference: "system",
      resolved: "dark",
    });
    expect(page.isDark()).toBe(true);
  });

  it("starts when something subscribes", () => {
    const { store, page } = setup();

    store.subscribe(() => {});

    expect(page.isDark()).toBe(true);
  });

  it("starts when a theme is chosen", () => {
    const { store, page } = setup();

    store.setPreference("light");

    expect(store.getSnapshot().resolved).toBe("light");
    expect(page.isDark()).toBe(false);
  });

  it("reads the environment once, however often it is started", () => {
    const { store, environment } = setup();
    const listener = vi.fn();

    store.start();
    store.subscribe(listener);
    store.start();
    store.setPreference("light");

    expect(environment).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
