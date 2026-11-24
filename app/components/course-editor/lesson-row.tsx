import { Draggable } from "@hello-pangea/dnd";
import { Link } from "react-router";
import type { Route } from "../../routes/+types/instructor.$courseId";
import { formatDuration } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Clock, Eye, FileEdit, GripVertical } from "lucide-react";
import {
  DeleteLessonButton,
  InlineEditableLessonTitle,
} from "~/components/course-editor/lesson-controls";

type Lesson =
  Route.ComponentProps["loaderData"]["course"]["modules"][number]["lessons"][number];

export function LessonRow({
  lesson,
  index,
  courseId,
  courseSlug,
}: {
  lesson: Lesson;
  index: number;
  courseId: number;
  courseSlug: string;
}) {
  return (
    <Draggable draggableId={`lesson-${lesson.id}`} index={index}>
      {(lessonProvided, lessonSnapshot) => (
        <li ref={lessonProvided.innerRef} {...lessonProvided.draggableProps}>
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm${
              lessonSnapshot.isDragging
                ? " bg-muted shadow-md ring-1 ring-primary/30"
                : ""
            }`}
          >
            <div
              {...lessonProvided.dragHandleProps}
              className="cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <GripVertical className="size-4" />
            </div>
            <div className="flex-1">
              <InlineEditableLessonTitle
                value={lesson.title}
                lessonId={lesson.id}
              />
            </div>
            {lesson.durationMinutes && (
              <LessonDuration minutes={lesson.durationMinutes} />
            )}
            <LessonLinks
              viewTo={`/courses/${courseSlug}/lessons/${lesson.id}`}
              editTo={`/instructor/${courseId}/lessons/${lesson.id}`}
            />
            <DeleteLessonButton lessonId={lesson.id} />
          </div>
        </li>
      )}
    </Draggable>
  );
}

function LessonLinks({ viewTo, editTo }: { viewTo: string; editTo: string }) {
  return (
    <>
      <Link to={viewTo} title="View lesson">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <Eye className="size-3.5" />
        </Button>
      </Link>
      <Link to={editTo} title="Edit lesson">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        >
          <FileEdit className="size-3.5" />
        </Button>
      </Link>
    </>
  );
}

function LessonDuration({ minutes }: { minutes: number }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3" />
      {formatDuration(minutes, true, false, false)}
    </span>
  );
}
