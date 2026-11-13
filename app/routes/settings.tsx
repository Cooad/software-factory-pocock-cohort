import { useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/settings";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { UserRole, RefundStatus, users } from "~/db/schema";
import { AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { formatPrice } from "~/lib/utils";
import { listRefundRequestsForBuyer } from "~/lib/refunds.server";
import { updateOwnProfile } from "~/lib/users.server";
import { defaultNotifier } from "~/lib/notifications.server";
import {
  getNotificationSettings,
  savePreference,
  type NotificationSetting,
} from "~/lib/notification-settings.server";
import {
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
} from "~/lib/notification-preferences";
import { Switch } from "~/components/ui/switch";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty."),
  bio: z.string().trim().optional(),
});

const SAVE_NOTIFICATION_PREFERENCE = "save-notification-preference";
const PREFERENCE_SAVE_FAILED =
  "Couldn't save your notification setting. Try again.";

const notificationPreferenceSchema = z.object({
  category: z.enum(PREFERENCE_CATEGORIES),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const PREFERENCE_LABELS: Record<
  PreferenceCategory,
  { label: string; description: string }
> = {
  "refund-request-updates": {
    label: "Refund Request updates",
    description: "When your Refund Request is received, approved or declined.",
  },
  "open-refund-requests": {
    label: "Open Refund Requests",
    description: "When someone raises a Refund Request that needs a decision.",
  },
  "seat-claims": {
    label: "Seat claims",
    description: "When someone claims a Seat on one of your Team Licences.",
  },
  enrollments: {
    label: "Enrollments",
    description: "When a Student enrolls in one of your courses.",
  },
  "discussion-questions": {
    label: "Discussion Questions",
    description: "When someone asks a question on one of your lessons.",
  },
  "discussion-replies": {
    label: "Discussion Replies",
    description: "When someone replies to a question you asked.",
  },
};

export function meta() {
  return [
    { title: "Settings — Cadence" },
    { name: "description", content: "Edit your profile details" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to edit your details.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const refundRequests = listRefundRequestsForBuyer(db, currentUserId);

  // Notifications are best-effort: if the vendor is down the rest of the page
  // still loads, and the card says it couldn't load.
  let notificationSettings: NotificationSetting[] | null = null;
  try {
    notificationSettings = await getNotificationSettings(
      db,
      defaultNotifier(),
      currentUserId
    );
  } catch (error) {
    console.error("[notifications] loading preferences failed:", error);
  }

  return {
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      bio: currentUser.bio,
      role: currentUser.role,
    },
    refundRequests,
    notificationSettings,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();
  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const formData = await request.formData();

  if (formData.get("intent") === SAVE_NOTIFICATION_PREFERENCE) {
    const preference = parseFormData(formData, notificationPreferenceSchema);
    if (!preference.success) {
      return data(
        { preferenceError: "That setting can't be saved." },
        { status: 400 }
      );
    }
    try {
      await savePreference(
        defaultNotifier(),
        currentUser.id,
        preference.data.category,
        preference.data.enabled
      );
    } catch (error) {
      console.error("[notifications] saving a preference failed:", error);
      throw data(PREFERENCE_SAVE_FAILED, { status: 502 });
    }
    return { preferenceSaved: true };
  }

  const parsed = parseFormData(formData, settingsSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const { name, bio } = parsed.data;

  await updateOwnProfile(
    db,
    defaultNotifier(),
    currentUser.id,
    name,
    bio || null
  );
  return { success: true };
}

/**
 * A failed preference save is thrown like any other failure. A switch is saved
 * by a fetcher, though, so rather than replace the page with the error
 * boundary, the switch gets the message back, shows a toast and reverts.
 */
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  try {
    return await serverAction();
  } catch (error) {
    if (
      isRouteErrorResponse(error) &&
      error.status === 502 &&
      error.data === PREFERENCE_SAVE_FAILED
    ) {
      return { preferenceError: PREFERENCE_SAVE_FAILED };
    }
    throw error;
  }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, refundRequests, notificationSettings } = loaderData;
  const openCount = refundRequests.filter(
    (refundRequest) => refundRequest.status === RefundStatus.Open
  ).length;
  const fetcher = useFetcher();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Profile updated successfully.");
    }
    if (fetcher.state === "idle" && fetcher.data?.errors) {
      const firstError = Object.values(fetcher.data.errors)[0] as string | undefined;
      if (firstError) toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Settings</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Update your profile details
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <h2 className="text-lg font-semibold">Profile</h2>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                ref={nameInputRef}
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            {user.role === UserRole.Instructor && (
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={user.bio ?? ""}
                  placeholder="Tell students about yourself..."
                />
                <p className="text-xs text-muted-foreground">
                  Your bio is shown on your course pages.
                </p>
              </div>
            )}
            <Button
              type="submit"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>

      <NotificationsCard settings={notificationSettings} />

      {refundRequests.length > 0 && (
        <Card className="mt-8 max-w-md">
          <CardHeader>
            <h2 className="text-lg font-semibold">Refund Requests</h2>
            {openCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {openCount === 1
                  ? "One refund request is waiting on us."
                  : `${openCount} refund requests are waiting on us.`}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {refundRequests.map((refundRequest) => (
              <div key={refundRequest.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/courses/${refundRequest.courseSlug}`}
                    className="font-medium hover:underline"
                  >
                    {refundRequest.courseTitle}
                  </Link>
                  <RefundStatusBadge status={refundRequest.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(refundRequest.amountPaid)} · raised{" "}
                  {new Date(refundRequest.requestedAt).toLocaleDateString()}
                  {refundRequest.resolvedAt && (
                    <>
                      {" "}
                      · decided{" "}
                      {new Date(refundRequest.resolvedAt).toLocaleDateString()}
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm">{refundRequest.reason}</p>
                {refundRequest.decisionNote && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                    <span className="font-medium">Our note: </span>
                    {refundRequest.decisionNote}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NotificationsCard({
  settings,
}: {
  settings: NotificationSetting[] | null;
}) {
  return (
    <Card id="notifications" className="mt-8 max-w-md scroll-mt-6">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose what shows up in your Notification Feed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings === null ? (
          <p className="text-sm text-muted-foreground">
            Your notification settings couldn't be loaded. Try again later.
          </p>
        ) : (
          settings.map((setting) => (
            <NotificationSwitch key={setting.category} setting={setting} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One switch, saved as soon as it's flipped. It shows the submitted value
 * while saving (optimistic). A failed save shows a toast and falls back to the
 * stored value, which puts the switch back.
 */
function NotificationSwitch({ setting }: { setting: NotificationSetting }) {
  const fetcher = useFetcher<typeof clientAction>({
    key: `notification-preference-${setting.category}`,
  });
  const { label, description } = PREFERENCE_LABELS[setting.category];
  const id = `notification-${setting.category}`;
  const submitted = fetcher.formData?.get("enabled");
  const checked =
    typeof submitted === "string" ? submitted === "true" : setting.enabled;
  const error =
    fetcher.data && "preferenceError" in fetcher.data
      ? fetcher.data.preferenceError
      : undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && error) toast.error(error);
  }, [fetcher.state, fetcher.data, error]);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(enabled) =>
          fetcher.submit(
            {
              intent: SAVE_NOTIFICATION_PREFERENCE,
              category: setting.category,
              enabled: String(enabled),
            },
            { method: "post" }
          )
        }
      />
    </div>
  );
}

const REFUND_STATUS_BADGES: Record<
  RefundStatus,
  { label: string; className: string }
> = {
  [RefundStatus.Open]: {
    label: "Open",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  [RefundStatus.Declined]: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
  },
};

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const badge = REFUND_STATUS_BADGES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
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
    } else if (error.status === 404) {
      title = "User not found";
      message =
        typeof error.data === "string" ? error.data : "User not found.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
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
        </div>
      </div>
    </div>
  );
}
