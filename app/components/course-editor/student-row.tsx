import {
  rosterStatus,
  type QuizScore,
  type RosterStudent,
} from "~/modules/course-roster";
import {
  statusColours,
  statusLabels,
} from "~/components/course-editor/roster-status";

export function StudentRow({
  student,
  quizCount,
}: {
  student: RosterStudent;
  quizCount: number;
}) {
  const enrolledDate = new Date(student.enrolledAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );
  const status = rosterStatus(student);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium">{student.name}</p>
          <p className="text-xs text-muted-foreground">{student.email}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {enrolledDate}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${student.progress}%` }}
            />
          </div>
          <span className="text-sm font-medium">{student.progress}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColours[status]}`}
        >
          {statusLabels[status]}
        </span>
      </td>
      {quizCount > 0 && (
        <td className="px-4 py-3">
          <QuizScores scores={student.quizScores} />
        </td>
      )}
    </tr>
  );
}

function QuizScores({ scores }: { scores: QuizScore[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {scores.map((qs) => (
        <div
          key={qs.quizId}
          className="flex items-center gap-1"
          title={`${qs.quizTitle} (${qs.lessonTitle})`}
        >
          {qs.bestScore === null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                qs.passed
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {Math.round(qs.bestScore * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
