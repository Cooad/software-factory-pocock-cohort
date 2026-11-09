import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/team";
import { getCurrentUserId } from "~/lib/session";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Users, BookOpen, Copy, Check, AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { db } from "~/db";
import {
  teams,
  teamMembers,
  coupons,
  courses,
  users,
  TeamMemberRole,
} from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { Textarea } from "~/components/ui/textarea";
import { formatPrice } from "~/lib/utils";
import { getRefundOffer, hasOpenRefundRequest } from "~/lib/refunds.server";

function getTeamForAdmin(userId: number) {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function getCouponsForTeam(teamId: number) {
  return db.select().from(coupons).where(eq(coupons.teamId, teamId)).all();
}

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

interface CourseStats {
  courseId: number;
  courseTitle: string;
  courseSlug: string;
  totalSeats: number;
  claimedSeats: number;
}

interface CouponRow {
  id: number;
  code: string;
  courseId: number;
  courseTitle: string;
  redeemedByEmail: string | null;
  createdAt: string;
  /** "held" while its purchase has an Open Refund Request. */
  state: "claimed" | "voided" | "held" | "unclaimed";
}

interface TeamRefundOffer {
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  amount: number;
  seatCount: number;
  lastDayInWindow: string;
}

export function meta() {
  return [
    { title: "Team — Cadence" },
    { name: "description", content: "Manage your team's course seats" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const team = getTeamForAdmin(currentUserId);

  if (!team) {
    throw data("You don't have a team. Purchase team seats to create one.", {
      status: 403,
    });
  }

  const allCoupons = getCouponsForTeam(team.id);

  // Build per-course stats
  const courseMap = new Map<
    number,
    {
      courseId: number;
      courseTitle: string;
      courseSlug: string;
      total: number;
      claimed: number;
    }
  >();

  for (const coupon of allCoupons) {
    if (!courseMap.has(coupon.courseId)) {
      const course = getCourseById(coupon.courseId);
      courseMap.set(coupon.courseId, {
        courseId: coupon.courseId,
        courseTitle: course?.title ?? "Unknown Course",
        courseSlug: course?.slug ?? "",
        total: 0,
        claimed: 0,
      });
    }
    const entry = courseMap.get(coupon.courseId)!;
    entry.total++;
    if (coupon.redeemedByUserId !== null) {
      entry.claimed++;
    }
  }

  const courseStats: CourseStats[] = Array.from(courseMap.values()).map(
    (e) => ({
      courseId: e.courseId,
      courseTitle: e.courseTitle,
      courseSlug: e.courseSlug,
      totalSeats: e.total,
      claimedSeats: e.claimed,
    })
  );

  const heldPurchaseIds = new Set(
    [...new Set(allCoupons.map((c) => c.purchaseId))].filter((id) =>
      hasOpenRefundRequest(db, id)
    )
  );

  // Build coupon rows with redeemer email
  const couponRows: CouponRow[] = allCoupons.map((coupon) => {
    let redeemedByEmail: string | null = null;
    if (coupon.redeemedByUserId !== null) {
      const user = getUserById(coupon.redeemedByUserId);
      redeemedByEmail = user?.email ?? null;
    }
    const course = getCourseById(coupon.courseId);
    return {
      id: coupon.id,
      code: coupon.code,
      courseId: coupon.courseId,
      courseTitle: course?.title ?? "Unknown Course",
      redeemedByEmail,
      createdAt: coupon.createdAt,
      state:
        coupon.redeemedByUserId !== null
          ? "claimed"
          : coupon.voidedAt
            ? "voided"
            : heldPurchaseIds.has(coupon.purchaseId)
              ? "held"
              : "unclaimed",
    };
  });

  // A team purchase can be refunded only while none of its Seats is claimed.
  // The refund action works on the buyer's latest purchase of the course, so
  // offer it only when that purchase is one of this team's.
  const teamPurchaseIds = new Set(allCoupons.map((c) => c.purchaseId));
  const refundOffers: TeamRefundOffer[] = [];
  for (const stat of courseStats) {
    const result = getRefundOffer(db, currentUserId, stat.courseId);
    if ("offer" in result && teamPurchaseIds.has(result.offer.purchaseId)) {
      refundOffers.push({
        courseId: stat.courseId,
        courseSlug: stat.courseSlug,
        courseTitle: stat.courseTitle,
        amount: result.offer.amount,
        seatCount: result.offer.seatCount,
        lastDayInWindow: result.offer.lastDayInWindow,
      });
    }
  }

  return { courseStats, couponRows, refundOffers };
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/redeem/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
      title="Copy redemption link"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy link
        </>
      )}
    </button>
  );
}

export default function Team({ loaderData }: Route.ComponentProps) {
  const { courseStats, couponRows, refundOffers } = loaderData;
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");

  const filteredCoupons =
    courseFilter === "all"
      ? couponRows
      : couponRows.filter((c) => c.courseId === courseFilter);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Team</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Team Management</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team&apos;s course seats and coupon codes
        </p>
      </div>

      {/* Per-course stats */}
      {courseStats.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courseStats.map((stat) => (
            <Card key={stat.courseId}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <h3 className="font-semibold truncate">{stat.courseTitle}</h3>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      {stat.claimedSeats}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {stat.totalSeats}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      seats claimed
                    </p>
                  </div>
                  <Link to={`/courses/${stat.courseSlug}/purchase?mode=team`}>
                    <Button variant="outline" size="sm">
                      Buy more seats
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Coupon list */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coupons</h2>
          {courseStats.length > 1 && (
            <select
              value={courseFilter}
              onChange={(e) =>
                setCourseFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">All courses</option>
              {courseStats.map((stat) => (
                <option key={stat.courseId} value={stat.courseId}>
                  {stat.courseTitle}
                </option>
              ))}
            </select>
          )}
        </div>

        {filteredCoupons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No coupons yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Course</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">
                        {coupon.code}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {coupon.courseTitle}
                    </td>
                    <td className="px-4 py-3">
                      {coupon.state === "claimed" ? (
                        <span className="text-muted-foreground">
                          Claimed by {coupon.redeemedByEmail}
                        </span>
                      ) : coupon.state === "voided" ? (
                        <span
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          title="This purchase was refunded, so the code no longer works."
                        >
                          Refunded — no longer valid
                        </span>
                      ) : coupon.state === "held" ? (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          title="Can't be redeemed while your refund request is decided."
                        >
                          On hold
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Unclaimed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(coupon.state === "unclaimed" ||
                        coupon.state === "held") && (
                        <CopyButton code={coupon.code} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {couponRows.some((c) => c.state === "held") && (
        <p className="mt-4 text-sm text-muted-foreground">
          Codes on hold can&apos;t be redeemed while we decide your refund
          request. If we approve it they stop working for good; if we decline
          it they work again straight away.
        </p>
      )}

      {refundOffers.map((offer) => (
        <TeamRefundForm key={offer.courseId} offer={offer} />
      ))}
    </div>
  );
}

function TeamRefundForm({ offer }: { offer: TeamRefundOffer }) {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!open) {
    return (
      <div className="mt-8">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Request a refund for {offer.courseTitle}
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-8 max-w-xl">
      <CardHeader>
        <h2 className="text-lg font-semibold">
          Request a refund — {offer.courseTitle}
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatPrice(offer.amount)} for {offer.seatCount} seats. You can ask
          until{" "}
          {new Date(`${offer.lastDayInWindow}T00:00:00`).toLocaleDateString()}.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          While we decide, none of your {offer.seatCount} codes can be
          redeemed. If we approve, all {offer.seatCount} stop working for good.
        </div>
        <Form method="post" action={`/courses/${offer.courseSlug}/refund`}>
          <input type="hidden" name="redirectTo" value="/team" />
          <Textarea
            name="reason"
            required
            minLength={10}
            maxLength={1000}
            placeholder="Why do you want a refund?"
          />
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Request a refund"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "No team found";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have a team yet.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
          <Link to="/courses">
            <Button variant="outline">Browse Courses</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
