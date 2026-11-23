import { describe, it, expect } from "vitest";
import { themeBootScript } from "../boot-script";
import { fakeMedia, fakeRoot, fakeStorage, throwingStorage } from "./fakes";
import type { ThemeStorage } from "../index";

function runBootScript(storage: ThemeStorage, prefersDark: boolean): boolean {
  const page = fakeRoot();
  const queries: string[] = [];
  const matchMedia = (query: string) => {
    queries.push(query);
    return fakeMedia(prefersDark).media;
  };
  // The script runs before React, as a plain string in the page head.
  new Function("localStorage", "matchMedia", "document", themeBootScript)(
    storage,
    matchMedia,
    { documentElement: page.root }
  );
  for (const query of queries) {
    expect(query).toBe("(prefers-color-scheme: dark)");
  }
  return page.isDark();
}

const saved = (value: string) =>
  fakeStorage({ "cadence-theme": value }).storage;

describe("themeBootScript", () => {
  it("follows a dark OS when nothing is saved", () => {
    expect(runBootScript(fakeStorage().storage, true)).toBe(true);
  });

  it("follows a light OS when nothing is saved", () => {
    expect(runBootScript(fakeStorage().storage, false)).toBe(false);
  });

  it("keeps a saved dark choice under a light OS", () => {
    expect(runBootScript(saved("dark"), false)).toBe(true);
  });

  it("keeps a saved light choice under a dark OS", () => {
    expect(runBootScript(saved("light"), true)).toBe(false);
  });

  it("follows the OS when storage throws", () => {
    expect(runBootScript(throwingStorage(), true)).toBe(true);
  });
});
