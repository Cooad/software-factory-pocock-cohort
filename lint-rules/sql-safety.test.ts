import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Runs the real oxlint binary with the repo config against snippets, so the
// test proves the rule is wired into .oxlintrc.json, not just that it parses.

const RULE = "sql-safety(no-dynamic-sql-raw)";
const dir = mkdtempSync(join(tmpdir(), "sql-safety-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fileCount = 0;
function lint(body: string): string {
  fileCount += 1;
  const file = join(dir, `case${fileCount}.ts`);
  writeFileSync(file, `import { sql } from "drizzle-orm";\n${body}\n`);
  try {
    return execFileSync(
      "node",
      ["node_modules/oxlint/bin/oxlint", "-c", ".oxlintrc.json", file],
      { encoding: "utf8" }
    );
  } catch (error) {
    const { stdout } = error as { stdout: string };
    return stdout;
  }
}

describe("sql-safety/no-dynamic-sql-raw", () => {
  it.each([
    ["interpolated template", "const s = 'x'; sql.raw(`a ${s}`);"],
    ["concatenation", "const s = 'x'; sql.raw('a' + s);"],
    ["variable", "const s = 'x'; sql.raw(s);"],
    ["computed access", "const s = 'x'; sql['raw'](s);"],
    ["escaped reference", "const r = sql.raw; r('x');"],
  ])("reports %s", (_name, body) => {
    expect(lint(body)).toContain(RULE);
  });

  it("reports an aliased import", () => {
    const output = lint(
      'import { sql as q } from "drizzle-orm";\nconst s = "x"; q.raw(s);'
    );
    expect(output).toContain(RULE);
  });

  it.each([
    ["string literal", "sql.raw('DESC');"],
    ["static template", "sql.raw(`DESC`);"],
    ["tagged template", "const s = 'x'; sql`a ${s}`;"],
  ])("allows %s", (_name, body) => {
    expect(lint(body)).not.toContain(RULE);
  });
});
