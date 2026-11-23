import { Link } from "react-router";
import type { Route } from "./+types/instructor.$courseId";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { courseRoster } from "~/modules/course-roster/index.server";
import { CourseStatus } from "~/db/schema";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  getCourseWithDetails,
  getEnrollmentCountForCourse,
  getLessonById,
  getLessonCountForCourse,
  getModuleById,
  moveLessonToModule,
  reorderLessons,
  reorderModules,
  updateCourse,
  updateCoursePppEnabled,
  updateCoursePrice,
  updateCourseSalesCopy,
  updateCourseStatus,
  updateLessonTitle,
  updateModuleTitle,
} from "./course-editor/course-editor-data.server";
import {
  InlineEditableDescription,
  InlineEditableTitle,
} from "~/components/course-editor/course-title-editors";
import { ContentTab } from "~/components/course-editor/content-tab";
import { SettingsTab } from "~/components/course-editor/settings-tab";
import { SalesCopyTab } from "~/components/course-editor/sales-copy-tab";
import { StudentsTab } from "~/components/course-editor/students-tab";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  ArrowLeft,
  BookOpen,
  Settings,
  Users,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { z } from "zod";
import { parseFormData } from "~/lib/validation";
import { normaliseSalesCopy } from "~/lib/sales-copy";

const courseEditorActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("update-title"),
    title: z.string().trim().min(1, "Title cannot be empty."),
  }),
  z.object({
    intent: z.literal("update-description"),
    description: z.string().trim().min(1, "Description cannot be empty."),
  }),
  z.object({
    intent: z.literal("update-status"),
    status: z.nativeEnum(CourseStatus),
  }),
  z.object({ intent: z.literal("update-price"), price: z.string() }),
  z.object({ intent: z.literal("update-ppp-enabled"), pppEnabled: z.string() }),
  z.object({
    intent: z.literal("add-module"),
    title: z.string().trim().min(1, "Module title cannot be empty."),
  }),
  z.object({
    intent: z.literal("rename-module"),
    moduleId: z.coerce.number().int(),
    title: z.string().trim().min(1, "Module title cannot be empty."),
  }),
  z.object({
    intent: z.literal("delete-module"),
    moduleId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("add-lesson"),
    moduleId: z.coerce.number().int(),
    title: z.string().trim().min(1, "Lesson title cannot be empty."),
  }),
  z.object({
    intent: z.literal("rename-lesson"),
    lessonId: z.coerce.number().int(),
    title: z.string().trim().min(1, "Lesson title cannot be empty."),
  }),
  z.object({
    intent: z.literal("reorder-modules"),
    moduleIds: z.string().min(1, "Missing module IDs."),
  }),
  z.object({
    intent: z.literal("reorder-lessons"),
    moduleId: z.coerce.number().int(),
    lessonIds: z.string().min(1, "Missing lesson IDs."),
  }),
  z.object({
    intent: z.literal("move-lesson"),
    lessonId: z.coerce.number().int(),
    targetModuleId: z.coerce.number().int(),
    targetPosition: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("delete-lesson"),
    lessonId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("update-sales-copy"),
    salesCopy: z
      .string()
      .transform(normaliseSalesCopy)
      .pipe(z.string().min(1, "Sales copy cannot be empty.")),
  }),
]);

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Edit Course";
  return [
    { title: `Edit: ${title} — Cadence` },
    { name: "description", content: `Edit course: ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const {
    course: { id: courseId },
  } = await coursePermissions.requireCapability(request, "manage", {
    courseId: params.courseId,
  });

  const course = getCourseWithDetails(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const lessonCount = getLessonCountForCourse(courseId);
  const enrollmentCount = getEnrollmentCountForCourse(courseId);
  const { students, quizCount } = courseRoster.get(courseId);

  return { course, lessonCount, enrollmentCount, students, quizCount };
}

export async function action({ params, request }: Route.ActionArgs) {
  const { course } = await coursePermissions.requireCapability(
    request,
    "manage",
    { courseId: params.courseId }
  );
  const courseId = course.id;

  const formData = await request.formData();
  const parsed = parseFormData(formData, courseEditorActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent } = parsed.data;

  if (intent === "update-title") {
    updateCourse(courseId, parsed.data.title, course.description);
    return { success: true, field: "title" };
  }

  if (intent === "update-description") {
    updateCourse(courseId, course.title, parsed.data.description);
    return { success: true, field: "description" };
  }

  if (intent === "update-status") {
    updateCourseStatus(courseId, parsed.data.status);
    return { success: true, field: "status" };
  }

  if (intent === "update-price") {
    const priceDollars = parseFloat(parsed.data.price);
    if (isNaN(priceDollars) || priceDollars < 0) {
      return data(
        { error: "Price must be a non-negative number." },
        { status: 400 }
      );
    }
    if (priceDollars > 9999.99) {
      return data({ error: "Price cannot exceed $9,999.99." }, { status: 400 });
    }
    const priceCents = Math.round(priceDollars * 100);
    updateCoursePrice(courseId, priceCents);
    return { success: true, field: "price" };
  }

  if (intent === "update-ppp-enabled") {
    const pppEnabled = parsed.data.pppEnabled === "true";
    updateCoursePppEnabled(courseId, pppEnabled);
    return { success: true, field: "ppp-enabled" };
  }

  if (intent === "add-module") {
    createModule(courseId, parsed.data.title, null);
    return { success: true, field: "module" };
  }

  if (intent === "rename-module") {
    const { moduleId, title } = parsed.data;
    const mod = getModuleById(moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    updateModuleTitle(moduleId, title);
    return { success: true, field: "module" };
  }

  if (intent === "delete-module") {
    const { moduleId } = parsed.data;
    const mod = getModuleById(moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    deleteModule(moduleId);
    return { success: true, field: "module" };
  }

  if (intent === "add-lesson") {
    const { moduleId, title } = parsed.data;
    const mod = getModuleById(moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    createLesson(moduleId, title);
    return { success: true, field: "lesson" };
  }

  if (intent === "rename-lesson") {
    const { lessonId, title } = parsed.data;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const mod = getModuleById(lesson.moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    updateLessonTitle(lessonId, title);
    return { success: true, field: "lesson" };
  }

  if (intent === "reorder-modules") {
    const moduleIds: number[] = JSON.parse(parsed.data.moduleIds);
    reorderModules(courseId, moduleIds);
    return { success: true, field: "module-reorder" };
  }

  if (intent === "reorder-lessons") {
    const { moduleId, lessonIds: lessonIdsJson } = parsed.data;
    const mod = getModuleById(moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    const lessonIds: number[] = JSON.parse(lessonIdsJson);
    reorderLessons(moduleId, lessonIds);
    return { success: true, field: "lesson-reorder" };
  }

  if (intent === "move-lesson") {
    const { lessonId, targetModuleId, targetPosition } = parsed.data;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const sourceMod = getModuleById(lesson.moduleId);
    if (!sourceMod || sourceMod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    const targetMod = getModuleById(targetModuleId);
    if (!targetMod || targetMod.courseId !== courseId) {
      return data(
        { error: "Target module not found in this course." },
        { status: 404 }
      );
    }
    moveLessonToModule(lessonId, targetModuleId, targetPosition);
    return { success: true, field: "lesson-move" };
  }

  if (intent === "delete-lesson") {
    const { lessonId } = parsed.data;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const mod = getModuleById(lesson.moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    deleteLesson(lessonId);
    return { success: true, field: "lesson" };
  }

  if (intent === "update-sales-copy") {
    updateCourseSalesCopy(courseId, parsed.data.salesCopy);
    return { success: true, field: "sales-copy" };
  }

  throw data("Invalid action.", { status: 400 });
}

export default function InstructorCourseEditor({
  loaderData,
}: Route.ComponentProps) {
  const { course, lessonCount, enrollmentCount, students, quizCount } =
    loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{course.title}</span>
      </nav>

      <Link
        to="/instructor"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to My Courses
      </Link>

      {/* Course Header with inline editing */}
      <div className="mb-8">
        <InlineEditableTitle value={course.title} />
        <div className="mt-2">
          <InlineEditableDescription value={course.description} />
        </div>

        {/* Stats row */}
        <div className="mt-4 flex flex-wrap items-center gap-4 px-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <BookOpen className="size-4" />
            {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-4" />
            {enrollmentCount} {enrollmentCount === 1 ? "student" : "students"}
          </span>
          <span className="text-xs text-muted-foreground">
            Slug: /courses/{course.slug}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">
            <BookOpen className="size-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="size-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="sales-copy">
            <FileText className="size-4" />
            Sales Copy
          </TabsTrigger>
          <TabsTrigger value="students">
            <Users className="size-4" />
            Students
          </TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="mt-6">
          <ContentTab course={course} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab course={course} />
        </TabsContent>

        <TabsContent value="sales-copy" className="mt-6">
          <SalesCopyTab key={course.id} course={course} />
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <StudentsTab students={students} quizCount={quizCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading the course editor.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message =
        "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Not allowed";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to edit this course.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
