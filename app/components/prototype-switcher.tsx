// PROTOTYPE — throwaway floating variant switcher (?variant=). Never ships.
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string }[];
  current: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(idx + delta + variants.length) % variants.length];
    const params = new URLSearchParams(location.search);
    params.set("variant", next.key);
    try {
      localStorage.setItem("prototype-feed-variant", next.key);
    } catch {}
    navigate({ search: params.toString() }, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-xl">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20" title="Previous (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-48 text-center">
        PROTOTYPE · {variants[idx].key} ({variants[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20" title="Next (→)">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
