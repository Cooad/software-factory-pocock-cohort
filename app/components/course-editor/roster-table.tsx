import type { Route } from "../../routes/+types/instructor.$courseId";
import type { RosterSortKey, RosterView } from "~/modules/course-roster";
import { StudentRow } from "~/components/course-editor/student-row";
import { Card, CardContent } from "~/components/ui/card";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type Student = Route.ComponentProps["loaderData"]["students"][number];

const headerClass =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

const sortableColumns: { label: string; sortKey: RosterSortKey }[] = [
  { label: "Student", sortKey: "name" },
  { label: "Enrolled", sortKey: "enrolledAt" },
  { label: "Progress", sortKey: "progress" },
];

export function RosterTable({
  students,
  quizCount,
  view,
  onSort,
}: {
  students: Student[];
  quizCount: number;
  view: RosterView;
  onSort: (sortBy: RosterSortKey) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {sortableColumns.map((column) => (
                  <SortableHeader
                    key={column.sortKey}
                    {...column}
                    view={view}
                    onSort={onSort}
                  />
                ))}
                <th className={headerClass}>Status</th>
                {quizCount > 0 && <th className={headerClass}>Quiz Scores</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <StudentRow
                  key={student.userId}
                  student={student}
                  quizCount={quizCount}
                />
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students match these filters.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SortableHeader({
  label,
  sortKey,
  view,
  onSort,
}: {
  label: string;
  sortKey: RosterSortKey;
  view: RosterView;
  onSort: (sortBy: RosterSortKey) => void;
}) {
  const active = view.sortBy === sortKey;
  const ascending = view.direction === "asc";
  const Icon = !active ? ArrowUpDown : ascending ? ArrowUp : ArrowDown;

  return (
    <th
      className={headerClass}
      aria-sort={!active ? "none" : ascending ? "ascending" : "descending"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </th>
  );
}
