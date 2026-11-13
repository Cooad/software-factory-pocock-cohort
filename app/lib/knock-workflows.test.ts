import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  KNOCK_CATEGORY_KEY,
  WORKFLOW_KEY_BY_KIND,
  kindForWorkflow,
} from "./notifications.knock";
import { PREFERENCE_CATEGORY_BY_KIND } from "./notification-preferences";

// The workflows in knock/workflows/ are pushed to Knock, which does the muting
// by category. This catches the files and Cadence's kind tables drifting apart.

const WORKFLOWS_DIR = join(__dirname, "..", "..", "knock", "workflows");

const workflowDirs = readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function declaredCategories(workflowKey: string): unknown {
  const file = join(WORKFLOWS_DIR, workflowKey, "workflow.json");
  return JSON.parse(readFileSync(file, "utf8")).categories;
}

describe("knock/workflows", () => {
  it.each(workflowDirs)(
    "%s is a known kind and declares that kind's preference category",
    (workflowKey) => {
      const kind = kindForWorkflow(workflowKey);
      expect(kind, `no Notification kind uses workflow ${workflowKey}`).toBeDefined();
      if (!kind) return;
      expect(declaredCategories(workflowKey)).toEqual([
        KNOCK_CATEGORY_KEY[PREFERENCE_CATEGORY_BY_KIND[kind]],
      ]);
    }
  );

  it("has a workflow folder for every Notification kind", () => {
    expect([...workflowDirs].sort()).toEqual(
      Object.values(WORKFLOW_KEY_BY_KIND).sort()
    );
  });
});
