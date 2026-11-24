import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useFetcher } from "react-router";
import type { Route } from "../../routes/+types/instructor.$courseId";
import { Card, CardContent } from "~/components/ui/card";
import { BookOpen } from "lucide-react";
import { curriculumDragIntent } from "~/components/course-editor/curriculum-drag";
import { ModuleCard } from "~/components/course-editor/module-card";
import { AddModuleForm } from "~/components/course-editor/module-controls";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";

type Course = Route.ComponentProps["loaderData"]["course"];

export function ContentTab({ course }: { course: Course }) {
  const reorderFetcher = useFetcher();
  const lessonReorderFetcher = useFetcher();
  useFetcherToast(reorderFetcher, "Modules reordered.");
  useFetcherToast(lessonReorderFetcher, "Lessons reordered.");

  function handleDragEnd(result: DropResult) {
    const intent = curriculumDragIntent(result, course.modules);
    if (!intent) return;
    const fetcher =
      result.type === "module" ? reorderFetcher : lessonReorderFetcher;
    fetcher.submit(intent, { method: "post" });
  }

  return (
    <>
      {course.modules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No modules yet. Add your first module to start building content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="modules" type="module">
            {(provided) => (
              <div
                className="space-y-4"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {course.modules.map((mod, index) => (
                  <ModuleCard
                    key={mod.id}
                    mod={mod}
                    index={index}
                    course={course}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      <AddModuleForm />
    </>
  );
}
