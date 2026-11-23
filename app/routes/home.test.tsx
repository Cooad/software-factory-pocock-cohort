import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import Home from "./home";

type HomeProps = Parameters<typeof Home>[0];

const loaderData = {
  featuredCourses: [
    {
      id: 1,
      slug: "intro",
      title: "Intro",
      description: "A course",
      coverImageUrl: null,
      instructorName: "Ada",
      lessonCount: 3,
    },
  ],
  totalCourses: 4,
  totalCategories: 5,
  users: [],
  currentUser: null,
  devCountry: null,
  countryTierInfo: { tier: 1, discount: 0, label: "Full price" },
  countries: [],
} as unknown as HomeProps["loaderData"];

function renderHome() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <Home {...({ loaderData } as HomeProps)} />,
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("home page", () => {
  it("left-aligns its content instead of centring it", () => {
    const html = renderHome();

    expect(html).toContain("Learn to code,");
    expect(html).not.toContain("text-center");
  });

  it("keeps each stats icon centred inside its box", () => {
    const html = renderHome();

    expect(html).toContain(
      'class="mb-3 flex size-12 items-center justify-center rounded-lg bg-primary/10"'
    );
  });
});
