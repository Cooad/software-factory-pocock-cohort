import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { createCategory } from "~/lib/categories.server";
import { createCourse, setCourseStatus } from "~/lib/courses.server";
import { changeUserRole, createStudent } from "~/lib/users.server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

// Built from the same Drizzle migrations as the live database, so test and
// production schemas cannot drift apart.
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const testDb = drizzle(sqlite, { schema });

  migrate(testDb, { migrationsFolder });

  return testDb;
}

export function createUserWithRole(
  testDb: ReturnType<typeof createTestDb>,
  name: string,
  email: string,
  role: UserRole
) {
  const student = createStudent(testDb, name, email);
  return changeUserRole(testDb, student.id, role);
}

export function seedBaseData(testDb: ReturnType<typeof createTestDb>) {
  const user = createStudent(testDb, "Test User", "test@example.com");

  const instructor = createUserWithRole(
    testDb,
    "Test Instructor",
    "instructor@example.com",
    UserRole.Instructor
  );

  const category = createCategory(testDb, "Programming");

  const draft = createCourse(
    testDb,
    "Test Course",
    "test-course",
    "A test course",
    "## Test Course\n\nSales copy for the test course.",
    instructor.id,
    category.id,
    null
  );
  const course = setCourseStatus(
    testDb,
    draft.id,
    CourseStatus.Published,
    new Date()
  );

  return { user, instructor, category, course };
}
