import { Link } from "react-router";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { CourseImage } from "~/components/course-image";
import { UserAvatar } from "~/components/user-avatar";
import { StarRating } from "~/components/star-rating";
import { formatPrice } from "~/lib/utils";
import type {
  CatalogBadge,
  CatalogCourse,
} from "~/modules/course-catalog/index.server";

const BADGE_LABELS = {
  "your-course": "Your Course",
  enrolled: "Enrolled",
  locked: "Locked",
} as const;

function CourseBadge({ badge }: { badge: CatalogBadge }) {
  if (!badge) return null;
  const tone =
    badge === "locked"
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {badge === "locked" && <Lock className="size-3" />}
      {BADGE_LABELS[badge]}
    </span>
  );
}

function CourseProgress({ course }: { course: CatalogCourse }) {
  if (course.progress === null || course.progress === 0) return null;
  return (
    <CardContent className="pt-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {course.completedLessons} / {course.lessonCount} lessons
        </span>
        <span className="font-medium">{course.progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${course.progress}%` }}
        />
      </div>
    </CardContent>
  );
}

function CourseCardFooter({ course }: { course: CatalogCourse }) {
  return (
    <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <UserAvatar
          name={course.instructorName}
          avatarUrl={course.instructorAvatarUrl}
          className="size-5"
        />
        {course.instructorName}
      </span>
      <span className="font-semibold text-foreground">
        {course.pppPrice < course.price ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs line-through text-muted-foreground font-normal">
              {formatPrice(course.price)}
            </span>
            {formatPrice(course.pppPrice)}
          </span>
        ) : (
          formatPrice(course.price)
        )}
      </span>
    </CardFooter>
  );
}

export function CourseCard({ course }: { course: CatalogCourse }) {
  return (
    <Link to={`/courses/${course.slug}`} className="group">
      <Card className="h-full overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
        <div className="aspect-video overflow-hidden">
          <CourseImage
            src={course.coverImageUrl}
            alt={course.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium">
            <span className="text-primary">{course.categoryName}</span>
            <CourseBadge badge={course.badge} />
          </div>
          <h3 className="text-lg font-semibold leading-tight group-hover:text-primary">
            {course.title}
          </h3>
          <StarRating
            average={course.ratingAverage}
            count={course.ratingCount}
            className="mt-1"
          />
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        </CardContent>
        <CourseProgress course={course} />
        <CourseCardFooter course={course} />
      </Card>
    </Link>
  );
}
