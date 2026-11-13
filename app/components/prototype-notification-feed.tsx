// PROTOTYPE — throwaway. Three Notification Feed variants for wayfinder ticket
// "What does the Notification Feed look like in Cadence?" (#16), reading the
// real Knock headless feed API with an RS256 user token.
//
// Plan: three variants mounted in the real app layout (sidebar), switchable
// via ?variant=A|B|C (sticky via localStorage), on every app route.
//   A  Bell popover   — bell in sidebar header, badge = UNSEEN count, opening marks seen
//   B  Nav drawer     — sidebar nav item, pill = UNREAD count, right slide-over w/ tabs
//   C  Inbox page     — sidebar item w/ dot only, full page /prototype/notifications, toasts
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useFetcher, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Archive,
  Bell,
  BellDot,
  Check,
  CheckCheck,
  MessageSquare,
  Receipt,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";

export interface KnockConfig {
  userId: string;
  userToken: string;
  publicKey: string;
  feedChannelId: string;
}

export interface FeedItem {
  id: string;
  kind: string;
  body: string;
  url: string;
  actor: string | null;
  transactional: boolean;
  insertedAt: string;
  seenAt: string | null;
  readAt: string | null;
}

// Round 2: user picked A. B and C are off the switcher (still reachable via ?variant=B|C).
export const FEED_VARIANTS = [
  { key: "A", name: "Bell top-left" },
  { key: "A2", name: "Bell bottom-left" },
];

// ---------------------------------------------------------------- data

const API = "https://api.knock.app/v1";

function headers(cfg: KnockConfig) {
  return {
    Authorization: `Bearer ${cfg.publicKey}`,
    "X-Knock-User-Token": cfg.userToken,
    "Content-Type": "application/json",
  };
}

// The feed is shared across the layout; keep one copy per page load.
export function useKnockFeed(cfg: KnockConfig | null) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [meta, setMeta] = useState({ unread: 0, unseen: 0 });
  const [error, setError] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<FeedItem[]>([]);

  const refresh = useCallback(async () => {
    if (!cfg) return;
    const res = await fetch(
      `${API}/users/${cfg.userId}/feeds/${cfg.feedChannelId}?page_size=30&archived=exclude`,
      { headers: headers(cfg) }
    );
    if (!res.ok) {
      setError(`Knock feed ${res.status}: ${await res.text()}`);
      return;
    }
    setError(null);
    const json = await res.json();
    const next: FeedItem[] = json.entries.map((e: any) => ({
      id: e.id,
      kind: e.data?.kind ?? "unknown",
      body: e.data?.body ?? e.blocks?.[0]?.rendered ?? "(no body)",
      url: e.data?.url ?? "/",
      actor: e.data?.actor ?? null,
      transactional: !!e.data?.transactional,
      insertedAt: e.inserted_at,
      seenAt: e.seen_at,
      readAt: e.read_at,
    }));
    if (known.current) {
      const fresh = next.filter((i) => !known.current!.has(i.id));
      if (fresh.length) setArrivals(fresh);
    }
    known.current = new Set(next.map((i) => i.id));
    setItems(next);
    setMeta({ unread: json.meta.unread_count, unseen: json.meta.unseen_count });
  }, [cfg?.userId, cfg?.userToken]);

  useEffect(() => {
    known.current = null;
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const setStatus = useCallback(
    async (status: "seen" | "read" | "unread" | "archived", ids: string[]) => {
      if (!cfg || ids.length === 0) return;
      // optimistic
      const now = new Date().toISOString();
      setItems((prev) =>
        status === "archived"
          ? prev.filter((i) => !ids.includes(i.id))
          : prev.map((i) =>
              !ids.includes(i.id)
                ? i
                : status === "seen"
                  ? { ...i, seenAt: i.seenAt ?? now }
                  : status === "read"
                    ? { ...i, seenAt: i.seenAt ?? now, readAt: now }
                    : { ...i, readAt: null }
            )
      );
      await fetch(`${API}/messages/batch/${status}`, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({ message_ids: ids }),
      });
      refresh();
    },
    [cfg, refresh]
  );

  return { items, meta, error, arrivals, refresh, setStatus };
}

export type Feed = ReturnType<typeof useKnockFeed>;

export function useFeedVariant() {
  const [params] = useSearchParams();
  const fromUrl = params.get("variant");
  const [stored, setStored] = useState("A");
  useEffect(() => {
    if (fromUrl) localStorage.setItem("prototype-feed-variant", fromUrl);
    setStored(localStorage.getItem("prototype-feed-variant") ?? "A");
  }, [fromUrl]);
  return fromUrl ?? stored;
}

// ---------------------------------------------------------------- shared bits

function Body({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold">{p}</strong> : p))}
    </>
  );
}

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind.startsWith("refund")
    ? Receipt
    : kind.startsWith("discussion")
      ? MessageSquare
      : kind === "seat-claimed"
        ? UsersRound
        : Bell;
  return <Icon className={cn("size-4", className)} />;
}

function category(kind: string) {
  if (kind.startsWith("refund")) return "Refunds";
  if (kind.startsWith("discussion")) return "Discussions";
  if (kind === "seat-claimed") return "Team";
  return "Other";
}

function Lead({ item }: { item: FeedItem }) {
  return item.actor ? (
    <UserAvatar name={item.actor} avatarUrl={null} className="size-8 shrink-0" />
  ) : (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <KindIcon kind={item.kind} />
    </div>
  );
}

function useOpenItem(feed: Feed, after?: () => void) {
  const navigate = useNavigate();
  return (item: FeedItem) => {
    if (!item.readAt) feed.setStatus("read", [item.id]);
    after?.();
    navigate(item.url);
  };
}

function ErrorNote({ feed }: { feed: Feed }) {
  return feed.error ? (
    <div className="m-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive break-words">
      {feed.error}
    </div>
  ) : null;
}

function Empty() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      <Bell className="mx-auto mb-2 size-6 opacity-40" />
      You're all caught up.
    </div>
  );
}

// ---------------------------------------------------------------- Variant A: Bell popover
// Round 2 (user feedback): badge = UNREAD number; per-row "Read" button that
// doesn't navigate; header action is "Mark all as read" while anything is
// unread, then "Clear" (archives everything). Placement: top-left (A) or
// bottom-left in the user row (A2).

export function VariantABell({ feed, placement = "top" }: { feed: Feed; placement?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openItem = useOpenItem(feed, () => setOpen(false));
  const unreadIds = feed.items.filter((i) => !i.readAt).map((i) => i.id);

  useEffect(() => {
    if (!open) return;
    feed.setStatus("seen", feed.items.filter((i) => !i.seenAt).map((i) => i.id));
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", placement === "top" && "ml-auto")}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          placement === "top" ? "p-1.5" : "p-1"
        )}
        title="Notifications"
      >
        <Bell className={placement === "top" ? "size-5" : "size-4"} />
        {feed.meta.unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {feed.meta.unread > 9 ? "9+" : feed.meta.unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className={cn(
            "absolute left-full z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl",
            placement === "top" ? "top-0" : "bottom-0"
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            {unreadIds.length > 0 ? (
              <button
                className="flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => feed.setStatus("read", unreadIds)}
              >
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            ) : feed.items.length > 0 ? (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => feed.setStatus("archived", feed.items.map((i) => i.id))}
              >
                <Archive className="size-3.5" /> Clear
              </button>
            ) : null}
          </div>
          <ErrorNote feed={feed} />
          <div className="max-h-[28rem] overflow-y-auto">
            {feed.items.length === 0 && <Empty />}
            {feed.items.map((item) => (
              <div
                key={item.id}
                role="button"
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent",
                  !item.readAt && "bg-primary/5"
                )}
              >
                <Lead item={item} />
                <div className="min-w-0 flex-1">
                  <div className={cn(item.readAt && "text-muted-foreground")}>
                    <Body text={item.body} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{ago(item.insertedAt)}</div>
                </div>
                {!item.readAt && (
                  <button
                    title="Mark as read without opening"
                    onClick={(e) => {
                      e.stopPropagation();
                      feed.setStatus("read", [item.id]);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    <Check className="size-3" /> Read
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------- Variant B: Nav drawer

export function VariantBNavItem({ feed, onOpen }: { feed: Feed; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      Notifications
      {feed.meta.unread > 0 && (
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {feed.meta.unread}
        </span>
      )}
    </button>
  );
}

export function VariantBDrawer({ feed, open, onClose }: { feed: Feed; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const openItem = useOpenItem(feed, onClose);
  if (!open) return null;
  const shown = tab === "unread" ? feed.items.filter((i) => !i.readAt) : feed.items;
  const today = new Date().toDateString();
  const groups = [
    { label: "Today", items: shown.filter((i) => new Date(i.insertedAt).toDateString() === today) },
    { label: "Earlier", items: shown.filter((i) => new Date(i.insertedAt).toDateString() !== today) },
  ].filter((g) => g.items.length);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        className="flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-lg font-semibold">Notifications</span>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
        </div>
        <div className="flex items-center gap-1 border-b px-4 py-2 text-sm">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded-full px-3 py-1 capitalize", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {t}{t === "unread" && feed.meta.unread ? ` (${feed.meta.unread})` : ""}
            </button>
          ))}
          <button
            className="ml-auto text-xs text-primary hover:underline"
            onClick={() => feed.setStatus("read", feed.items.filter((i) => !i.readAt).map((i) => i.id))}
          >
            Mark all as read
          </button>
        </div>
        <ErrorNote feed={feed} />
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 && <Empty />}
          {groups.map((g) => (
            <section key={g.label}>
              <div className="sticky top-0 bg-background/95 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              {g.items.map((item) => (
                <div
                  key={item.id}
                  className="group relative mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-3 text-sm hover:bg-accent"
                  onClick={() => openItem(item)}
                >
                  {!item.readAt && <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-primary" />}
                  <Lead item={item} />
                  <div className="min-w-0 flex-1">
                    <div><Body text={item.body} /></div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <KindIcon kind={item.kind} className="size-3" />
                      {category(item.kind)} · {ago(item.insertedAt)}
                      {item.transactional && <span className="rounded bg-muted px-1.5">Account</span>}
                    </div>
                  </div>
                  <div className="hidden gap-1 group-hover:flex">
                    <button
                      title={item.readAt ? "Mark as unread" : "Mark as read"}
                      className="rounded p-1 hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation();
                        feed.setStatus(item.readAt ? "unread" : "read", [item.id]);
                      }}
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      title="Archive"
                      className="rounded p-1 hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation();
                        feed.setStatus("archived", [item.id]);
                      }}
                    >
                      <Archive className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- Variant C: Inbox page

export function VariantCNavItem({ feed }: { feed: Feed }) {
  return (
    <NavLink
      to="/prototype/notifications?variant=C"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      {feed.meta.unseen > 0 ? <BellDot className="size-4 text-red-600" /> : <Bell className="size-4" />}
      Notifications
    </NavLink>
  );
}

/** C pops a toast for each newly-arrived Notification while you're elsewhere in the app. */
export function VariantCToasts({ feed }: { feed: Feed }) {
  const navigate = useNavigate();
  useEffect(() => {
    for (const item of feed.arrivals) {
      toast(<span><Body text={item.body} /></span>, {
        action: { label: "View", onClick: () => { feed.setStatus("read", [item.id]); navigate(item.url); } },
      });
    }
  }, [feed.arrivals]);
  return null;
}

export function VariantCInbox({ feed }: { feed: Feed }) {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const openItem = useOpenItem(feed);

  // Visiting the inbox page marks everything as seen (sidebar dot clears).
  useEffect(() => {
    feed.setStatus("seen", feed.items.filter((i) => !i.seenAt).map((i) => i.id));
  }, [feed.items.length]);

  const shown = feed.items.filter((i) => filter === "All" || (filter === "Unread" ? !i.readAt : category(i.kind) === filter));
  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="mb-6 text-sm text-muted-foreground">{feed.meta.unread} unread</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["All", "Unread", "Refunds", "Discussions", "Team"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex gap-2 text-sm">
          <button
            disabled={!selected.size}
            className="rounded border px-3 py-1 hover:bg-accent disabled:opacity-40"
            onClick={() => { feed.setStatus("read", [...selected]); setSelected(new Set()); }}
          >
            Mark read
          </button>
          <button
            disabled={!selected.size}
            className="rounded border px-3 py-1 hover:bg-accent disabled:opacity-40"
            onClick={() => { feed.setStatus("archived", [...selected]); setSelected(new Set()); }}
          >
            Archive
          </button>
        </div>
      </div>
      <ErrorNote feed={feed} />
      <div className="overflow-hidden rounded-lg border">
        {shown.length === 0 && <Empty />}
        {shown.map((item) => (
          <div
            key={item.id}
            className={cn("flex items-center gap-4 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-accent", !item.readAt && "font-medium")}
          >
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
            <span className={cn("size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-blue-600")} />
            <span className="w-28 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">{category(item.kind)}</span>
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => openItem(item)}>
              <Body text={item.body} />
            </button>
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{ago(item.insertedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- seeding panel

const KIND_LABELS: Record<string, string> = {
  "refund-receipt": "#7 Refund receipt",
  "refund-approved": "#1 Refund approved",
  "refund-declined": "#2 Refund declined",
  "refund-raised": "#3 Refund raised",
  "discussion-reply": "#4 Discussion Reply",
  "discussion-question": "#5 Discussion Question",
  "seat-claimed": "#6 Seat claimed",
};

export function useToastToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(localStorage.getItem("prototype-feed-toasts") === "1"), []);
  const set = (v: boolean) => {
    localStorage.setItem("prototype-feed-toasts", v ? "1" : "0");
    setOn(v);
  };
  return [on, set] as const;
}

export function PrototypeSeedPanel({
  kinds,
  feed,
  toasts,
  setToasts,
}: {
  kinds: string[];
  feed: Feed;
  toasts: boolean;
  setToasts: (v: boolean) => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error: string | null }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setTimeout(feed.refresh, 1500);
  }, [fetcher.state]);
  const send = (k: string[]) =>
    fetcher.submit({ kinds: k.join(",") }, { method: "post", action: "/api/prototype-notifications" });
  return (
    <div className="fixed bottom-16 left-60 z-40 w-56 rounded-lg border border-dashed border-fuchsia-500 bg-background/95 p-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-fuchsia-600">PROTOTYPE · send to me via Knock</div>
      <div className="flex flex-col gap-1">
        {kinds.map((k) => (
          <button key={k} onClick={() => send([k])} className="rounded px-2 py-1 text-left hover:bg-accent">
            {KIND_LABELS[k] ?? k}
          </button>
        ))}
        <button onClick={() => send(kinds)} className="rounded bg-fuchsia-600 px-2 py-1 text-white">
          Send one of each
        </button>
        <label className="mt-1 flex cursor-pointer items-center gap-2 px-2">
          <input type="checkbox" checked={toasts} onChange={(e) => setToasts(e.target.checked)} />
          Toast new arrivals
        </label>
      </div>
      {fetcher.state !== "idle" && <div className="mt-1 text-muted-foreground">Sending…</div>}
      {fetcher.data?.error && <div className="mt-1 break-words text-destructive">{fetcher.data.error}</div>}
    </div>
  );
}
