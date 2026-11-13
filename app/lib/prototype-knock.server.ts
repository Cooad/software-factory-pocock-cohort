// PROTOTYPE — throwaway. Notification Feed prototype for wayfinder ticket
// "What does the Notification Feed look like in Cadence?" (#16).
// Lives on branch prototype/notification-feed only; never merge.
import { createSign } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessons, modules, UserRole } from "~/db/schema";

const KNOCK_API = "https://api.knock.app/v1";
export const PROTOTYPE_WORKFLOW_KEY = "prototype-feed";

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

/** RS256 user token, sub = Cadence user id (as verified in ticket #14). */
export function signKnockUserToken(userId: number) {
  const pem = Buffer.from(process.env.KNOCK_SIGNING_KEY!, "base64").toString(
    "utf8"
  );
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: String(userId), iat: now, exp: now + 60 * 60 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(pem).toString("base64url")}`;
}

export function knockClientConfig(userId: number) {
  return {
    userId: String(userId),
    userToken: signKnockUserToken(userId),
    publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
    feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID!,
  };
}

export type SampleKind =
  | "refund-approved"
  | "refund-declined"
  | "refund-raised"
  | "discussion-reply"
  | "discussion-question"
  | "seat-claimed"
  | "refund-receipt";

const NAMES = ["Priya Shah", "Tom Okafor", "Lena Vogel", "Marco Rossi"];

function sampleLesson() {
  const row = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
      courseTitle: courses.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .orderBy(asc(lessons.id))
    .get();
  return (
    row ?? {
      lessonId: 1,
      lessonTitle: "Intro",
      courseSlug: "intro",
      courseTitle: "Intro Course",
    }
  );
}

/** Catalogue (#12) entries each role can receive. Team Admin = Seat claimed. */
export function kindsForRole(role: UserRole, isTeamAdmin: boolean): SampleKind[] {
  const kinds: SampleKind[] = [];
  if (role === UserRole.Student)
    kinds.push("refund-receipt", "refund-approved", "refund-declined", "discussion-reply");
  if (role === UserRole.Instructor) kinds.push("discussion-question", "discussion-reply");
  if (role === UserRole.Admin) kinds.push("refund-raised", "discussion-reply");
  if (isTeamAdmin) kinds.push("seat-claimed", "refund-approved");
  return kinds;
}

function buildSample(kind: SampleKind) {
  const actor = NAMES[Math.floor(Math.random() * NAMES.length)];
  const l = sampleLesson();
  const lessonUrl = `/courses/${l.courseSlug}/lessons/${l.lessonId}`;
  const c = l.courseTitle;
  switch (kind) {
    case "refund-approved":
      return { kind, transactional: true, actor: null, url: "/settings", body: `Your Refund Request for **${c}** was approved` };
    case "refund-declined":
      return { kind, transactional: true, actor: null, url: "/settings", body: `Your Refund Request for **${c}** was declined` };
    case "refund-receipt":
      return { kind, transactional: true, actor: null, url: "/settings", body: `We've received your Refund Request for **${c}**; we'll let you know when it's decided` };
    case "refund-raised":
      return { kind, transactional: false, actor, url: "/admin/refunds", body: `**${actor}** requested a refund for **${c}**` };
    case "discussion-reply":
      return { kind, transactional: false, actor, url: `${lessonUrl}#discussion`, body: `**${actor}** replied to your question in **${l.lessonTitle}**` };
    case "discussion-question":
      return { kind, transactional: false, actor, url: "/instructor/questions", body: `**${actor}** asked a question in **${l.lessonTitle}**` };
    case "seat-claimed":
      return { kind, transactional: false, actor, url: "/team", body: `**${actor}** claimed a Seat on **${c}**` };
  }
}

export async function triggerSample(
  user: { id: number; name: string },
  kind: SampleKind
) {
  const data = buildSample(kind);
  const res = await fetch(`${KNOCK_API}/workflows/${PROTOTYPE_WORKFLOW_KEY}/trigger`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KNOCK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipients: [{ id: String(user.id), name: user.name }],
      data,
    }),
  });
  if (!res.ok) throw new Error(`Knock trigger failed ${res.status}: ${await res.text()}`);
}
