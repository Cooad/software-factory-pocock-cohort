import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  Bell,
  Check,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  UsersRound,
} from "lucide-react";
import { UserAvatar } from "~/components/user-avatar";
import {
  emptyFeedClient,
  type NotificationFeedClient,
} from "~/lib/notification-feed";
import {
  feedReducer,
  hasMorePages,
  initialFeedState,
} from "~/lib/notification-feed-state";
import {
  presentNotification,
  type NotificationCategoryIcon,
  type NotificationRow,
} from "~/lib/notification-presenter";
import type { NotificationFeedCredentials } from "~/lib/notifications";
import { cn } from "~/lib/utils";

// ─── Notification Feed: the bell and its popover ───
// Sits in the sidebar header next to "Cadence". Talks to the feed only through
// the client port (`NotificationFeedClient`); what it shows is
// `notification-feed-state.ts`. Without credentials (no Knock keys on the
// server) it uses the empty client, so the popover shows "You're all caught up."
//
// Reads: the first page on mount, then one page per scroll to the bottom. New
// Notifications arrive over the client's live connection; nothing polls.

const categoryIcons: Record<NotificationCategoryIcon, typeof Bell> = {
  discussion: MessageSquare,
  refund: Receipt,
  team: UsersRound,
  enrollment: GraduationCap,
};

/**
 * One feed client per signed-in user. Switching users in the DevUI changes the
 * credentials' user id, which tears the old client (and its socket) down and
 * builds a new one with the fresh token.
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

  return { client, key };
}

export function NotificationBell({
  credentials,
}: {
  credentials: NotificationFeedCredentials | null;
}) {
  const { client, key } = useFeedClient(credentials);
  // Keyed by user, so another user's client starts from an empty feed.
  return client ? (
    <FeedBell key={key} client={client} />
  ) : (
    <BellButton unseen={0} onClick={() => {}} />
  );
}

function FeedBell({ client }: { client: NotificationFeedClient }) {
  const [state, dispatch] = useReducer(feedReducer, initialFeedState);
  const [open, setOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const cursor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const loadPage = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await client.listPage(cursor.current);
      cursor.current = page.nextCursor;
      dispatch({ type: "page-loaded", page });
      setLoadFailed(false);
    } catch (error) {
      console.error("[notifications] could not load the feed", error);
      setLoadFailed(true);
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, [client]);

  useEffect(() => {
    void loadPage();
    return client.subscribe((update) =>
      dispatch({ type: "received", ...update })
    );
  }, [client, loadPage]);

  async function openPopover() {
    setOpen(true);
    if (state.counts.unseen === 0) return;
    dispatch({ type: "marked-all-seen", at: new Date().toISOString() });
    try {
      await client.markAllSeen();
    } catch (error) {
      console.error("[notifications] could not mark all seen", error);
    }
  }

  async function markRead(id: string) {
    dispatch({ type: "marked-read", id, at: new Date().toISOString() });
    try {
      await client.markRead(id);
    } catch (error) {
      console.error("[notifications] could not mark read", error);
    }
  }

  async function markAllRead() {
    dispatch({ type: "marked-all-read", at: new Date().toISOString() });
    try {
      await client.markAllRead();
    } catch (error) {
      console.error("[notifications] could not mark all read", error);
    }
  }

  return (
    <>
      <BellButton
        unseen={state.counts.unseen}
        onClick={() => (open ? setOpen(false) : void openPopover())}
      />

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
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={state.counts.unread === 0}
                className="ml-auto text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                Mark all as read
              </button>
              <Link
                to="/settings#notifications"
                onClick={() => setOpen(false)}
                aria-label="Notification settings"
                title="Notification settings"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="size-4" />
              </Link>
            </div>
            <FeedList
              rows={state.notifications.map((n) =>
                presentNotification(n, new Date())
              )}
              loaded={state.loaded}
              hasMore={hasMorePages(state) && !loadFailed}
              loadFailed={loadFailed}
              loadingMore={loadingMore}
              onLoadMore={loadPage}
              onOpen={() => setOpen(false)}
              onMarkRead={markRead}
            />
          </div>
        </>
      )}
    </>
  );
}

function BellButton({
  unseen,
  onClick,
}: {
  unseen: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        unseen > 0 ? `Notifications (${unseen} unseen)` : "Notifications"
      }
      className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      {unseen > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </button>
  );
}

function FeedList({
  rows,
  loaded,
  hasMore,
  loadFailed,
  loadingMore,
  onLoadMore,
  onOpen,
  onMarkRead,
}: {
  rows: NotificationRow[];
  loaded: boolean;
  hasMore: boolean;
  loadFailed: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onOpen: () => void;
  onMarkRead: (id: string) => Promise<void>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Infinite scroll: load the next page when the bottom comes into view.
  // Observing again after each page fires again if the bottom is still shown.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onLoadMore();
      },
      { root: list.current }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, rows.length]);

  if (loaded && rows.length === 0 && !hasMore) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        You're all caught up.
      </p>
    );
  }

  let footer: string | null = null;
  if (loadFailed) footer = "Couldn't load Notifications.";
  else if (hasMore || loadingMore) footer = "Loading…";
  else if (rows.length > 0) footer = "That's everything.";

  return (
    <div ref={list} className="flex-1 overflow-y-auto py-1">
      {rows.map((row) => (
        <NotificationRowItem
          key={row.id}
          row={row}
          onOpen={onOpen}
          onMarkRead={onMarkRead}
        />
      ))}
      <div
        ref={sentinel}
        className="px-4 py-3 text-center text-xs text-muted-foreground"
      >
        {footer}
      </div>
    </div>
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
      {row.unread && (
        <button
          type="button"
          onClick={() => void onMarkRead(row.id)}
          title="Mark as read"
          aria-label="Mark as read"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}
