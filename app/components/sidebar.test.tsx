import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { UserRole } from "~/db/schema";
import { Sidebar } from "./sidebar";

const longTitle = "Design Systems with Tailwind";
const longName = "Ava Nakamura";

function renderSidebar() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <Sidebar
          currentUser={{
            id: 11,
            name: longName,
            role: UserRole.Student,
            avatarUrl: null,
          }}
          recentCourses={[
            {
              courseId: 1,
              title: longTitle,
              slug: "design-systems-with-tailwind",
              coverImageUrl: null,
              completedLessons: 4,
              totalLessons: 9,
              progress: 44,
            },
          ]}
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

function openingTagAround(html: string, text: string) {
  const end = html.indexOf(`>${text}</div>`);
  if (end === -1) throw new Error(`No div holding "${text}"`);
  return html.slice(html.lastIndexOf("<div", end), end + 1);
}

describe("sidebar", () => {
  it("wraps a long recent course title to two lines instead of cutting it to one", () => {
    const tag = openingTagAround(renderSidebar(), longTitle);

    expect(tag).toContain("line-clamp-2");
    expect(tag).not.toContain("truncate");
    expect(tag).toContain(`title="${longTitle}"`);
  });

  it("shows the whole user name, wrapping rather than truncating", () => {
    const tag = openingTagAround(renderSidebar(), longName);

    expect(tag).toContain("break-words");
    expect(tag).not.toContain("truncate");
    expect(tag).toContain(`title="${longName}"`);
  });

  it("gives Settings and Sign out their own labelled rows, before the user's name", () => {
    const html = renderSidebar();
    const settings = html.indexOf('href="/settings"');
    const signOut = html.indexOf('action="/api/logout"');
    const name = html.indexOf(`>${longName}</div>`);

    expect(html).toMatch(/href="\/settings"[^>]*>.*?Settings<\/a>/);
    expect(html).toMatch(/>(<svg.*?<\/svg>)?Sign out<\/button>/);
    expect(settings).toBeGreaterThan(-1);
    expect(settings).toBeLessThan(name);
    expect(signOut).toBeGreaterThan(-1);
    expect(signOut).toBeLessThan(name);
  });
});
