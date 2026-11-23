import { LessonProgressStatus } from "~/db/schema";

export const statusLabels: Record<LessonProgressStatus, string> = {
  [LessonProgressStatus.NotStarted]: "Not Started",
  [LessonProgressStatus.InProgress]: "In Progress",
  [LessonProgressStatus.Completed]: "Completed",
};

export const statusColours: Record<LessonProgressStatus, string> = {
  [LessonProgressStatus.NotStarted]:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  [LessonProgressStatus.InProgress]:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  [LessonProgressStatus.Completed]:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};
