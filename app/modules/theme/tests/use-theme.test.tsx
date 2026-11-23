import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { useTheme } from "../index";

function ThemeProbe() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

describe("useTheme", () => {
  it("renders the light theme on the server, where there is no <html> to read", () => {
    expect(renderToString(<ThemeProbe />)).toBe("<span>light</span>");
  });
});
