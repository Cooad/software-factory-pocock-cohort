import {
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
} from "@hello-pangea/dnd";
import type { Route } from "../../routes/+types/instructor.$courseId";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { GripVertical } from "lucide-react";
import { LessonRow } from "~/components/course-editor/lesson-row";
import { AddLessonForm } from "~/components/course-editor/lesson-controls";
import {
  DeleteModuleButton,
  InlineEditableModuleTitle,
} from "~/components/course-editor/module-controls";

type Course = Route.ComponentProps["loaderData"]["course"];
type Module = Course["modules"][number];

export function ModuleCard({
  mod,
  index,
  course,
}: {
  mod: Module;
  index: number;
  course: Course;
}) {
  return (
    <Draggable draggableId={String(mod.id)} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps}>
          <Card
            className={
              snapshot.isDragging ? "shadow-lg ring-2 ring-primary/50" : ""
            }
          >
            <CardHeader>
              <ModuleHeader
                mod={mod}
                dragHandleProps={provided.dragHandleProps}
              />
            </CardHeader>
            <CardContent>
              <ModuleLessons mod={mod} course={course} />
              <AddLessonForm moduleId={mod.id} />
            </CardContent>
          </Card>
        </div>
      )}
    </Draggable>
  );
}

function ModuleLessons({ mod, course }: { mod: Module; course: Course }) {
  if (mod.lessons.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">No lessons yet.</p>
    );
  }

  return (
    <Droppable droppableId={`lessons-${mod.id}`} type="lesson">
      {(lessonDropProvided) => (
        <ul
          className="space-y-1"
          ref={lessonDropProvided.innerRef}
          {...lessonDropProvided.droppableProps}
        >
          {mod.lessons.map((lesson, lessonIndex) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={lessonIndex}
              courseId={course.id}
              courseSlug={course.slug}
            />
          ))}
          {lessonDropProvided.placeholder}
        </ul>
      )}
    </Droppable>
  );
}

function ModuleHeader({
  mod,
  dragHandleProps,
}: {
  mod: Module;
  dragHandleProps: DraggableProvidedDragHandleProps | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 flex-1">
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <GripVertical className="size-5" />
        </div>
        <div className="flex-1">
          <InlineEditableModuleTitle value={mod.title} moduleId={mod.id} />
          <p className="mt-1 px-2 text-sm text-muted-foreground">
            {mod.lessons.length}{" "}
            {mod.lessons.length === 1 ? "lesson" : "lessons"}
          </p>
        </div>
      </div>
      <DeleteModuleButton moduleId={mod.id} moduleTitle={mod.title} />
    </div>
  );
}
