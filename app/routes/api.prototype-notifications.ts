// PROTOTYPE — throwaway. Seeds real Knock Notifications for the current DevUI user.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-notifications";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { triggerSample, type SampleKind } from "~/lib/prototype-knock.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  const form = await request.formData();
  const kinds = String(form.get("kinds")).split(",") as SampleKind[];
  try {
    for (const kind of kinds) await triggerSample(user, kind);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true, error: null };
}
