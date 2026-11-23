import { LessonProgressStatus } from "~/db/schema";
import type { RosterView } from "~/modules/course-roster";
import { statusLabels } from "~/components/course-editor/roster-status";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Search } from "lucide-react";

const statusFilters: RosterView["status"][] = [
  "all",
  LessonProgressStatus.NotStarted,
  LessonProgressStatus.InProgress,
  LessonProgressStatus.Completed,
];

function isStatusFilter(value: string): value is RosterView["status"] {
  return statusFilters.some((status) => status === value);
}

function filterLabel(status: RosterView["status"]) {
  return status === "all" ? "All statuses" : statusLabels[status];
}

export function RosterFilters({
  view,
  onChange,
  shownCount,
  totalCount,
}: {
  view: RosterView;
  onChange: (view: RosterView) => void;
  shownCount: number;
  totalCount: number;
}) {
  const isFiltered = view.search.trim() !== "" || view.status !== "all";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search students"
          placeholder="Search by name or email"
          value={view.search}
          onChange={(event) =>
            onChange({ ...view, search: event.target.value })
          }
          className="pl-8"
        />
      </div>
      <StatusFilter
        status={view.status}
        onChange={(status) => onChange({ ...view, status })}
      />
      {isFiltered && (
        <>
          <span className="text-sm text-muted-foreground">
            Showing {shownCount} of {totalCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...view, search: "", status: "all" })}
          >
            Clear filters
          </Button>
        </>
      )}
    </div>
  );
}

function StatusFilter({
  status,
  onChange,
}: {
  status: RosterView["status"];
  onChange: (status: RosterView["status"]) => void;
}) {
  return (
    <Select
      value={status}
      onValueChange={(value) => {
        if (isStatusFilter(value)) onChange(value);
      }}
    >
      <SelectTrigger className="w-40" aria-label="Filter by status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusFilters.map((status) => (
          <SelectItem key={status} value={status}>
            {filterLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
