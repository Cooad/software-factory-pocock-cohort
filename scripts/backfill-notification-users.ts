// One-off backfill: syncs every Cadence user in data.db to the Notifications
// vendor (Knock) and writes Cadence's default preference set (Enrollments off,
// everything else on) for anyone who has none yet. Existing preferences are
// kept, so it is safe to run again.
//
// Run with `npm run notifications:backfill`. Without a Knock secret key in the
// environment or .env, the no-op logging adapter is used and nothing is sent.
import { db } from "../app/db";
import {
  defaultNotifier,
  knockConfigFromEnv,
} from "../app/lib/notifications.server";
import { syncAllUsers } from "../app/lib/users.server";

async function backfill() {
  const target = knockConfigFromEnv()
    ? "Knock"
    : "the logging adapter (no KNOCK_SECRET_API_KEY, nothing sent)";
  console.log(`Syncing every user to ${target}...`);

  const { synced, failed } = await syncAllUsers(db, defaultNotifier());

  console.log(`Synced ${synced} users, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

backfill().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
