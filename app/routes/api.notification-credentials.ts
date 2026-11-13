import { data } from "react-router";
import type { Route } from "./+types/api.notification-credentials";
import { defaultNotifier } from "~/lib/notifications.server";
import { getCurrentUserId } from "~/lib/session";

// ─── Notification Feed credentials, freshly signed ───
// The app shell's loader signs feed credentials on every navigation. A page
// left open longer than the user token lives (1 h) fetches new ones from here
// when the token is about to expire. Always for the session user.

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  const credentials = await defaultNotifier().feedCredentials(userId);
  if (!credentials) {
    throw data("The Notification Feed isn't set up.", { status: 404 });
  }
  return Response.json(credentials, {
    headers: { "Cache-Control": "no-store" },
  });
}
