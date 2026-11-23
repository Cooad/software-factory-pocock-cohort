import type { DropResult } from "@hello-pangea/dnd";

type CurriculumModule = { id: number; lessons: { id: number }[] };

function moduleIdOf(droppableId: string) {
  return parseInt(droppableId.replace("lessons-", ""), 10);
}

function moved<T>(items: readonly T[], from: number, to: number) {
  const reordered = Array.from(items);
  const [item] = reordered.splice(from, 1);
  reordered.splice(to, 0, item);
  return reordered;
}

/**
 * The course editor action a finished drag asks for: reorder the modules,
 * reorder the lessons of one module, or move a lesson to another module.
 * `null` when the drag changed nothing.
 */
export function curriculumDragIntent(
  result: DropResult,
  modules: readonly CurriculumModule[]
): Record<string, string> | null {
  const { source, destination } = result;
  if (!destination) return null;
  if (
    source.droppableId === destination.droppableId &&
    source.index === destination.index
  ) {
    return null;
  }

  if (result.type === "module") {
    const moduleIds = moved(modules, source.index, destination.index).map(
      (m) => m.id
    );
    return { intent: "reorder-modules", moduleIds: JSON.stringify(moduleIds) };
  }
  if (result.type !== "lesson") return null;

  const sourceModuleId = moduleIdOf(source.droppableId);
  const destModuleId = moduleIdOf(destination.droppableId);
  const sourceMod = modules.find((m) => m.id === sourceModuleId);
  if (!sourceMod) return null;

  if (sourceModuleId === destModuleId) {
    const lessonIds = moved(
      sourceMod.lessons,
      source.index,
      destination.index
    ).map((l) => l.id);
    return {
      intent: "reorder-lessons",
      moduleId: String(sourceModuleId),
      lessonIds: JSON.stringify(lessonIds),
    };
  }

  const lesson = sourceMod.lessons[source.index];
  if (!lesson) return null;
  return {
    intent: "move-lesson",
    lessonId: String(lesson.id),
    targetModuleId: String(destModuleId),
    targetPosition: String(destination.index + 1),
  };
}
