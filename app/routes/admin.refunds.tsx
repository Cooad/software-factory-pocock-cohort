import { useEffect, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { data, isRouteErrorResponse } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.refunds";
import { db } from "~/db";
import {
  RefundEventKind,
  RefundRequestStatus,
  RefundStatus,
  UserRole,
  users,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  approveRefundRequest,
  countRefundsNeedingAction,
  declineRefundRequest,
  listRefundRequestsForAdmin,
  markRefundFailed,
  markRefundIssued,
  REFUND_TABS,
  RefundError,
  retryRefund,
  sendEmail,
  type AdminRefundRow,
  type RefundTab,
} from "~/lib/refunds.server";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { AlertTriangle, ReceiptText } from "lucide-react";

const TAB_LABELS: Record<RefundTab, string> = {
  "needs-action": "Needs action",
  approved: "Approved",
  declined: "Declined",
  all: "All",
};

export function meta() {
  return [
    { title: "Refunds — Cadence" },
    {
      name: "description",
      content: "Approve or decline Refund Requests and track Refunds",
    },
  ];
}

async function requireAdmin(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  const user = db.select().from(users).where(eq(users.id, currentUserId)).get();
  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }
  return user;
}

function parseTab(value: string | null): RefundTab {
  return REFUND_TABS.includes(value as RefundTab)
    ? (value as RefundTab)
    : "needs-action";
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const tab = parseTab(new URL(request.url).searchParams.get("tab"));
  return {
    tab,
    rows: listRefundRequestsForAdmin(db, tab),
    needsActionCount: countRefundsNeedingAction(db),
  };
}

const id = z.coerce.number().int().positive();

const refundActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundRequestId: id,
    decisionNote: z.string().max(2000).optional(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundRequestId: id,
    decisionNote: z
      .string()
      .trim()
      .min(1, "Tell the learner why you're declining.")
      .max(2000),
  }),
  z.object({ intent: z.literal("mark-issued"), refundId: id }),
  z.object({
    intent: z.literal("mark-failed"),
    refundId: id,
    note: z.string().trim().min(1, "Say what went wrong.").max(2000),
  }),
  z.object({ intent: z.literal("retry"), refundId: id }),
]);

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid request." },
      { status: 400 }
    );
  }

  const input = parsed.data;
  try {
    switch (input.intent) {
      case "approve": {
        const result = approveRefundRequest(db, {
          refundRequestId: input.refundRequestId,
          adminId: admin.id,
          decisionNote: input.decisionNote,
        });
        sendEmail(result.email);
        return { ok: true, message: "Approved. The Refund is now pending." };
      }
      case "decline": {
        const result = declineRefundRequest(db, {
          refundRequestId: input.refundRequestId,
          adminId: admin.id,
          decisionNote: input.decisionNote,
        });
        sendEmail(result.email);
        return { ok: true, message: "Declined." };
      }
      case "mark-issued": {
        const result = markRefundIssued(db, {
          refundId: input.refundId,
          adminId: admin.id,
        });
        sendEmail(result.email);
        return { ok: true, message: "Marked as issued." };
      }
      case "mark-failed":
        markRefundFailed(db, {
          refundId: input.refundId,
          adminId: admin.id,
          note: input.note,
        });
        return { ok: true, message: "Marked as failed." };
      case "retry":
        retryRefund(db, { refundId: input.refundId, adminId: admin.id });
        return { ok: true, message: "Back to pending." };
    }
  } catch (error) {
    if (error instanceof RefundError) {
      const status =
        error.code === "not-found"
          ? 404
          : error.code === "note-required"
            ? 400
            : 409;
      return data({ error: error.message }, { status });
    }
    throw error;
  }
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { tab, rows, needsActionCount } = loaderData;
  const [, setSearchParams] = useSearchParams();

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <ReceiptText className="size-7" />
          Refunds
        </h1>
        <p className="mt-1 text-muted-foreground">
          Decide Refund Requests and confirm when the money has gone back.
        </p>
      </div>

      <div
        role="tablist"
        className="mb-6 inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground"
      >
        {REFUND_TABS.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() =>
              setSearchParams(value === "needs-action" ? {} : { tab: value })
            }
            className={`inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
              tab === value
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            }`}
          >
            {TAB_LABELS[value]}
            {value === "needs-action" && needsActionCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {needsActionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "needs-action"
            ? "Nothing waiting on an Admin."
            : "No refund requests here."}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <RefundRequestCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function formatHours(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const PILL_TONES = {
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  muted: "bg-muted text-muted-foreground",
};

function Pill({
  tone,
  children,
}: {
  tone: keyof typeof PILL_TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function StatusPills({ row }: { row: AdminRefundRow }) {
  if (row.status === RefundRequestStatus.Open) {
    return <Pill tone="amber">Open</Pill>;
  }
  if (row.status === RefundRequestStatus.Declined) {
    return <Pill tone="muted">Declined</Pill>;
  }
  const refundStatus = row.refund?.status;
  return (
    <div className="flex gap-1.5">
      <Pill tone="green">Approved</Pill>
      {refundStatus === RefundStatus.Pending && (
        <Pill tone="amber">Refund pending</Pill>
      )}
      {refundStatus === RefundStatus.Issued && (
        <Pill tone="green">Refund issued</Pill>
      )}
      {refundStatus === RefundStatus.Failed && (
        <Pill tone="red">Refund failed</Pill>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function RefundRequestCard({ row }: { row: AdminRefundRow }) {
  const isTeam = row.seats.total > 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/courses/${row.course.slug}`}
              className="font-semibold hover:underline"
            >
              {row.course.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {row.learner.name} · {row.learner.email}
            </p>
          </div>
          <StatusPills row={row} />
        </div>

        {isTeam && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Team purchase, {row.seats.total} Seats, {row.seats.claimed} claimed
            {row.status === RefundRequestStatus.Open &&
              ` — approving cancels ${row.seats.total - row.seats.claimed} codes`}
          </p>
        )}

        {row.warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" />
              Since the request was made, this purchase breaks a refund rule:
            </p>
            <ul className="ml-6 list-disc">
              {row.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Paid">{formatPrice(row.purchase.amountPaid)}</Fact>
          <Fact label="Bought">{formatDate(row.purchase.createdAt)}</Fact>
          <Fact label="Requested">{formatDate(row.requestedAt)}</Fact>
          <Fact label="Window">
            {row.now.daysLeftInWindow > 0
              ? `${row.now.daysLeftInWindow} days left`
              : `Closed ${formatDate(`${row.now.lastDayInWindow}T23:59:59`)}`}
          </Fact>
          <Fact label="Watched (now)">{formatHours(row.now.watchedSeconds)}</Fact>
          <Fact label="Lessons completed (now)">
            {row.now.completedLessons} / {row.now.totalLessons}
          </Fact>
          <Fact label="Country">{row.purchase.country ?? "—"}</Fact>
          <Fact label="Earlier declines">{row.earlierDeclines.length}</Fact>
        </dl>

        <div>
          <p className="text-xs text-muted-foreground">Learner's reason</p>
          <p className="text-sm">{row.reason}</p>
        </div>

        {row.earlierDeclines.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Earlier declined requests on this purchase
            </summary>
            <ul className="mt-2 space-y-1">
              {row.earlierDeclines.map((decline, i) => (
                <li key={i}>
                  {formatDate(decline.decidedAt)}: {decline.decisionNote}
                </li>
              ))}
            </ul>
          </details>
        )}

        {row.status !== RefundRequestStatus.Open && (
          <div>
            <p className="text-xs text-muted-foreground">
              {row.status === RefundRequestStatus.Approved
                ? "Approved"
                : "Declined"}{" "}
              by {row.decidedBy ?? "—"} on {formatDate(row.decidedAt)}
            </p>
            <p className="text-sm">
              {row.decisionNote ?? (
                <span className="text-muted-foreground">No Decision Note.</span>
              )}
            </p>
          </div>
        )}

        {row.refund && row.refund.events.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Refund history</p>
            <ul className="text-sm">
              {row.refund.events.map((event) => (
                <li key={event.id}>
                  {formatDate(event.at)} — {EVENT_LABELS[event.kind]} by{" "}
                  {event.by}
                  {event.note && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({event.note})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {row.status === RefundRequestStatus.Open && (
          <DecideForm refundRequestId={row.id} />
        )}
        {row.refund?.status === RefundStatus.Pending && (
          <PendingRefundActions refundId={row.refund.id} />
        )}
        {row.refund?.status === RefundStatus.Failed && (
          <RefundActionButton
            refundId={row.refund.id}
            intent="retry"
            label="Retry — back to pending"
          />
        )}
      </CardContent>
    </Card>
  );
}

const EVENT_LABELS: Record<RefundEventKind, string> = {
  [RefundEventKind.Issued]: "Issued",
  [RefundEventKind.Failed]: "Failed",
  [RefundEventKind.Retried]: "Retried",
};

type ActionResult = { ok?: boolean; message?: string; error?: string };

function useActionToast(fetcher: ReturnType<typeof useFetcher<ActionResult>>) {
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.message) toast.success(fetcher.data.message);
  }, [fetcher.state, fetcher.data]);
}

function DecideForm({ refundRequestId }: { refundRequestId: number }) {
  const fetcher = useFetcher<ActionResult>();
  useActionToast(fetcher);
  const [note, setNote] = useState("");
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="space-y-2 border-t pt-4">
      <input type="hidden" name="refundRequestId" value={refundRequestId} />
      <label className="text-sm font-medium" htmlFor={`note-${refundRequestId}`}>
        Decision Note{" "}
        <span className="font-normal text-muted-foreground">
          — sent to the learner. Required to decline.
        </span>
      </label>
      <Textarea
        id={`note-${refundRequestId}`}
        name="decisionNote"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
      />
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="approve" disabled={busy}>
          Approve
        </Button>
        <Button
          type="submit"
          name="intent"
          value="decline"
          variant="outline"
          disabled={busy || note.trim() === ""}
          title={
            note.trim() === "" ? "Write a Decision Note to decline" : undefined
          }
        >
          Decline
        </Button>
      </div>
    </fetcher.Form>
  );
}

function PendingRefundActions({ refundId }: { refundId: number }) {
  const fetcher = useFetcher<ActionResult>();
  useActionToast(fetcher);
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState("");
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="space-y-2 border-t pt-4">
      <input type="hidden" name="refundId" value={refundId} />
      {failing && (
        <>
          <label className="text-sm font-medium" htmlFor={`fail-${refundId}`}>
            What went wrong?{" "}
            <span className="font-normal text-muted-foreground">
              — Admins only.
            </span>
          </label>
          <Textarea
            id={`fail-${refundId}`}
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        </>
      )}
      <div className="flex gap-2">
        {!failing && (
          <Button type="submit" name="intent" value="mark-issued" disabled={busy}>
            Mark issued
          </Button>
        )}
        {failing ? (
          <>
            <Button
              type="submit"
              name="intent"
              value="mark-failed"
              variant="destructive"
              disabled={busy || note.trim() === ""}
            >
              Mark failed
            </Button>
            <Button type="button" variant="ghost" onClick={() => setFailing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setFailing(true)}>
            Mark failed…
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}

function RefundActionButton({
  refundId,
  intent,
  label,
}: {
  refundId: number;
  intent: string;
  label: string;
}) {
  const fetcher = useFetcher<ActionResult>();
  useActionToast(fetcher);
  return (
    <fetcher.Form method="post" className="border-t pt-4">
      <input type="hidden" name="refundId" value={refundId} />
      <Button
        type="submit"
        name="intent"
        value={intent}
        variant="outline"
        disabled={fetcher.state !== "idle"}
      >
        {label}
      </Button>
    </fetcher.Form>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 401
        ? "Sign in required"
        : error.status === 403
          ? "Admins only"
          : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
