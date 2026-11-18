export function isLapsed(student: { enrollmentId: number | null }): boolean {
  return student.enrollmentId === null;
}
