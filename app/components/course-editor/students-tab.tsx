import { useState } from "react";
import type { Route } from "../../routes/+types/instructor.$courseId";
import {
  defaultRosterView,
  sortRosterBy,
  viewRoster,
  type RosterView,
} from "~/modules/course-roster";
import { RosterFilters } from "~/components/course-editor/roster-filters";
import { RosterTable } from "~/components/course-editor/roster-table";
import { Card, CardContent } from "~/components/ui/card";
import { Award, Users } from "lucide-react";

type Student = Route.ComponentProps["loaderData"]["students"][number];

export function StudentsTab({
  students,
  quizCount,
}: {
  students: Student[];
  quizCount: number;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" />
          {students.length} {students.length === 1 ? "student" : "students"}{" "}
          enrolled
        </span>
        {quizCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Award className="size-4" />
            {quizCount} {quizCount === 1 ? "quiz" : "quizzes"}
          </span>
        )}
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No students enrolled in this course yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Roster students={students} quizCount={quizCount} />
      )}
    </>
  );
}

function Roster({
  students,
  quizCount,
}: {
  students: Student[];
  quizCount: number;
}) {
  const [view, setView] = useState<RosterView>(defaultRosterView);
  const shown = viewRoster(students, view);

  return (
    <>
      <RosterFilters
        view={view}
        onChange={setView}
        shownCount={shown.length}
        totalCount={students.length}
      />
      <RosterTable
        students={shown}
        quizCount={quizCount}
        view={view}
        onSort={(sortBy) => setView((current) => sortRosterBy(current, sortBy))}
      />
    </>
  );
}
