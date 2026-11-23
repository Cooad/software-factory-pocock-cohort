import { Form, Link, useNavigation, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/courses";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { AlertTriangle, BookOpen, Search } from "lucide-react";
import { CourseCard } from "~/components/course-card";
import { resolveCountry } from "~/lib/country.server";
import { courseCatalog } from "~/modules/course-catalog/index.server";
import { people } from "~/modules/permissions/person.server";

const catalogParamsSchema = z.object({
  q: z.string().nullable().catch(null),
  category: z.string().nullable().catch(null),
  owned: z
    .string()
    .nullable()
    .transform((value) => value === "1")
    .catch(false),
});

export function meta() {
  return [
    { title: "Browse Courses — Cadence" },
    { name: "description", content: "Browse all available courses" },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const params = catalogParamsSchema.parse({
    q: url.searchParams.get("q"),
    category: url.searchParams.get("category"),
    owned: url.searchParams.get("owned"),
  });
  const person = await people.getPerson(request);
  const country = await resolveCountry(request);

  const { courses, categories } = courseCatalog.browse(
    { person, country },
    { search: params.q, category: params.category, owned: params.owned }
  );

  return {
    courses,
    categories,
    search: params.q,
    category: params.category,
    owned: params.owned && person !== null,
    signedIn: person !== null,
  };
}

function CourseCardSkeleton() {
  return (
    <Card className="h-full">
      <Skeleton className="aspect-video rounded-b-none rounded-t-lg" />
      <CardHeader>
        <Skeleton className="mb-1 h-3 w-16" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-1 h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-1 h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </CardFooter>
    </Card>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-64" />
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- placeholders never reorder
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function CourseCatalog({ loaderData }: Route.ComponentProps) {
  const { courses, categories, search, category, owned, signedIn } = loaderData;
  const navigation = useNavigation();
  const isSearching =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/courses";

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Browse Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Find courses to expand your skills
        </p>
      </div>

      {/* Search and Filter */}
      <Form method="get" className="mb-8 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search courses..."
            className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          name="category"
          defaultValue={category ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>
        {signedIn && (
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="owned"
              value="1"
              defaultChecked={owned}
              className="size-4 rounded border-input"
            />
            Owned
          </label>
        )}
        <Button type="submit">Search</Button>
      </Form>

      {/* Course Grid */}
      {isSearching ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- placeholders never reorder
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No courses found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {owned && !search && !category
              ? "You don't own any courses yet."
              : search || category || owned
                ? "Try adjusting your search or filters."
                : "No published courses are available yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading courses.";

  if (isRouteErrorResponse(error)) {
    title = `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
