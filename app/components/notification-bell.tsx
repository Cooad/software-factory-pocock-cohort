import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  GraduationCap,
  MessageSquare,
  Receipt,
  UsersRound,
} from "lucide-react";
import { UserAvatar } from "~/components/user-avatar";
import {
  emptyFeedClient,
  type FeedCounts,
  type FeedNotification,
  type NotificationFeedClient,
} from "~/lib/notification-feed";
import {
  presentNotification,
  type NotificationCategoryIcon,
  type NotificationRow,
} from "~/lib/notification-presenter";
import type { NotificationFeedCredentials } from "~/lib/notifications";
import { cn } from "~/lib/utils";

// ─── Notification Feed: the bell and its popover ───
// Sits in the sidebar header next to "Cadence". Talks to the feed only through
// the client port (`NotificationFeedClient`). Without credentials (no Knock
// keys on the server) it uses the empty client, so the popover shows
// "You're all caught up."

const categoryIcons: Record<NotificationCategoryIcon, typeof Bell> = {
  discussion: MessageSquare,
  refund: Receipt,
  team: UsersRound,
  enrollment: GraduationCap,
};

const NO_COUNTS: FeedCounts = { unseen: 0, unread: 0 };

/**
 * One feed client per signed-in user. Switching users in the DevUI changes the
 * credentials' user id, which tears the old client down and builds a new one.
 */
function useFeedClient(credentials: NotificationFeedCredentials | null) {
  const [client, setClient] = useState<NotificationFeedClient | null>(null);
  const latest = useRef(credentials);
  latest.current = credentials;
  const key = credentials
    ? `${credentials.userId}:${credentials.publicApiKey}:${credentials.feedChannelId}`
    : "none";

  useEffect(() => {
    const current = latest.current;
    if (!current) {
      setClient(emptyFeedClient);
      return;
    }
    let created: NotificationFeedClient | null = null;
    let cancelled = false;
    import("~/lib/notification-feed.knock").then(
      ({ createKnockFeedClient }) => {
        if (cancelled) return;
        created = createKnockFeedClient(current);
        setClient(created);
      },
      (error) => {
        console.error("[notifications] could not load the feed client", error);
        if (!cancelled) setClient(emptyFeedClient);
      }
    );
    return () => {
      cancelled = true;
      created?.disconnect();
      setClient(null);
    };
  }, [key]);

  return client;
}

export function NotificationBell({
  credentials,
}: {
  credentials: NotificationFeedCredentials | null;
}) {
  const client = useFeedClient(credentials);
  const [notifications, setNotifications] = useState<FeedNotification[]>([]);
  const [counts, setCounts] = useState<FeedCounts>(NO_COUNTS);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const loadFirstPage = useCallback(async () => {
    if (!client) return null;
    try {
      const page = await client.listPage();
      setNotifications(page.notifications);
      setCounts(page.counts);
      return page;
    } catch (error) {
      console.error("[notifications] could not load the feed", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setNotifications([]);
    setCounts(NO_COUNTS);
    setLoading(true);
    void loadFirstPage();
  }, [loadFirstPage]);

  async function openPopover() {
    setOpen(true);
    if (!client) return;
    const page = await loadFirstPage();
    if (page && page.counts.unseen > 0) {
      setCounts((c) => ({ ...c, unseen: 0 }));
      try {
        await client.markAllSeen();
      } catch (error) {
        console.error("[notifications] could not mark all seen", error);
      }
    }
  }

  async function markRead(id: string) {
    setNotifications((list) =>
      list.map((n) =>
        n.id === id && n.readAt === null
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1) }));
    try {
      await client?.markRead(id);
    } catch (error) {
      console.error("[notifications] could not mark read", error);
    }
  }

  const badge = counts.unseen > 9 ? "9+" : String(counts.unseen);

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openPopover())}
        aria-label={
          counts.unseen > 0
            ? `Notifications (${counts.unseen} unseen)`
            : "Notifications"
        }
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {counts.unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed left-56 top-2 z-50 ml-2 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-3">
              <Bell className="size-4" />
              <h2 className="text-sm font-semibold">Notifications</h2>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {loading ? "Loading…" : "You're all caught up."}
                </p>
              ) : (
                notifications.map((notification) => (
                  <NotificationRowItem
                    key={notification.id}
                    row={presentNotification(notification, new Date())}
                    onOpen={() => setOpen(false)}
                    onMarkRead={markRead}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function NotificationRowItem({
  row,
  onOpen,
  onMarkRead,
}: {
  row: NotificationRow;
  onOpen: () => void;
  onMarkRead: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const CategoryIcon = categoryIcons[row.categoryIcon];

  function handleClick() {
    if (row.unread) void onMarkRead(row.id);
    if (!row.href) return;
    onOpen();
    navigate(row.href);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
      <span className="relative shrink-0">
        {row.avatar.kind === "sender" ? (
          <UserAvatar
            name={row.avatar.name || "?"}
            avatarUrl={row.avatar.avatarUrl}
            className={cn("size-9", !row.unread && "opacity-60")}
          />
        ) : (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground",
              !row.unread && "opacity-60"
            )}
          >
            C
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground ring-1 ring-border">
          <CategoryIcon className="size-2.5" />
        </span>
      </span>
      <button
        type="button"
        onClick={handleClick}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={cn("block truncate text-sm", row.unread && "font-semibold")}
        >
          {row.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.snippet ? `${row.snippet} · ` : ""}
          {row.timeAgo}
        </span>
      </button>
    </div>
  );
}
