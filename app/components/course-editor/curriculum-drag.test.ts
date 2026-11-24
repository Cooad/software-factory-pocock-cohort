import { describe, it, expect } from "vitest";
import type { DropResult } from "@hello-pangea/dnd";
import { curriculumDragIntent } from "./curriculum-drag";

const modules = [
  { id: 10, lessons: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  { id: 20, lessons: [{ id: 4 }] },
  { id: 30, lessons: [] },
];

function drag(
  type: string,
  source: [string, number],
  destination: [string, number] | null
): DropResult {
  return {
    type,
    draggableId: "x",
    reason: "DROP",
    mode: "FLUID",
    combine: null,
    source: { droppableId: source[0], index: source[1] },
    destination: destination && {
      droppableId: destination[0],
      index: destination[1],
    },
  };
}

describe("curriculumDragIntent", () => {
  it("asks for nothing when the drop lands outside a list", () => {
    expect(
      curriculumDragIntent(drag("module", ["modules", 0], null), modules)
    ).toBeNull();
  });

  it("asks for nothing when the item lands where it started", () => {
    expect(
      curriculumDragIntent(
        drag("lesson", ["lessons-10", 1], ["lessons-10", 1]),
        modules
      )
    ).toBeNull();
  });

  it("reorders the modules", () => {
    expect(
      curriculumDragIntent(
        drag("module", ["modules", 0], ["modules", 2]),
        modules
      )
    ).toEqual({ intent: "reorder-modules", moduleIds: "[20,30,10]" });
  });

  it("reorders the lessons within one module", () => {
    expect(
      curriculumDragIntent(
        drag("lesson", ["lessons-10", 2], ["lessons-10", 0]),
        modules
      )
    ).toEqual({
      intent: "reorder-lessons",
      moduleId: "10",
      lessonIds: "[3,1,2]",
    });
  });

  it("moves a lesson to another module at a 1-based position", () => {
    expect(
      curriculumDragIntent(
        drag("lesson", ["lessons-10", 1], ["lessons-30", 0]),
        modules
      )
    ).toEqual({
      intent: "move-lesson",
      lessonId: "2",
      targetModuleId: "30",
      targetPosition: "1",
    });
  });

  it("asks for nothing when the source module or lesson is unknown", () => {
    expect(
      curriculumDragIntent(
        drag("lesson", ["lessons-99", 0], ["lessons-10", 0]),
        modules
      )
    ).toBeNull();
    expect(
      curriculumDragIntent(
        drag("lesson", ["lessons-20", 5], ["lessons-10", 0]),
        modules
      )
    ).toBeNull();
  });

  it("asks for nothing for an unknown drag type", () => {
    expect(
      curriculumDragIntent(drag("other", ["a", 0], ["b", 1]), modules)
    ).toBeNull();
  });
});
