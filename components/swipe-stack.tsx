"use client";

import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, X, RotateCcw, Sparkles, ListChecks } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, useUser } from "@/components/user-provider";
import { MatchOverlay } from "@/components/match-overlay";
import { flagInitials } from "@/lib/initials";

type NameItem = { id: number; name: string };
type Meta = { origin: string | null; meaning: string | null };
type Variant = { id: number; name: string };
type Popularity = { rank: number | null; blurb: string | null };

const palettes = [
  "from-amber-200 via-amber-50 to-rose-100",
  "from-rose-200 via-amber-50 to-amber-100",
  "from-emerald-100 via-amber-50 to-rose-100",
  "from-sky-100 via-amber-50 to-rose-100",
  "from-violet-100 via-amber-50 to-rose-100",
  "from-orange-200 via-amber-50 to-rose-100",
];

const SWIPE_THRESHOLD = 90;
const SWIPE_VELOCITY = 450;

function vibrate(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  }
}

// Names this device has already decided on, surviving SwipeStack remounts within
// one page load. The tabs (/swipe, /matches, /tournament) are separate routes, so
// switching tab unmounts SwipeStack and would otherwise wipe the in-memory guard —
// re-serving a swipe whose POST is still committing as if it were new. Keyed per
// identity so karo/lucy on a shared device never inherit each other's set.
const sessionSwipedBySlug = new Map<string, Set<number>>();
function sessionSwipedSet(slug: string | null | undefined): Set<number> {
  const key = slug ?? "_";
  let set = sessionSwipedBySlug.get(key);
  if (!set) {
    set = new Set<number>();
    sessionSwipedBySlug.set(key, set);
  }
  return set;
}

export function SwipeStack() {
  const { surname, user } = useUser();
  const [queue, setQueue] = useState<NameItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [shuffled, setShuffled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [matchName, setMatchName] = useState<NameItem | null>(null);
  const fetchingRef = useRef(false);
  const seedRef = useRef<number | null>(null);
  // The initializer binds to the right set on every mount: context `user` persists
  // across route changes, so on a tab-switch remount this is already the live slug
  // and the guard keeps prior (incl. still-committing) swipes. The effect below
  // only rebinds for an in-place identity switch.
  const swipedIdsRef = useRef<Set<number>>(sessionSwipedSet(user));
  const [hasSwipes, setHasSwipes] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [metaCache, setMetaCache] = useState<Record<number, Meta>>({});
  const [variantsCache, setVariantsCache] = useState<Record<number, Variant[]>>({});
  const [popCache, setPopCache] = useState<Record<number, Popularity>>({});
  const detailInflightRef = useRef<Set<number>>(new Set());

  const fetchMore = useCallback(async (reset = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const r = await apiFetch("/api/names?limit=30");
      if (!r.ok) throw new Error("failed");
      const j = (await r.json()) as { names: NameItem[]; total: number; shuffled: boolean };
      setTotal(j.total);
      setShuffled(j.shuffled);
      setQueue((q) => {
        const base = reset ? [] : q;
        const seen = new Set(base.map((n) => n.id));
        const merged = [...base];
        for (const n of j.names) {
          if (seen.has(n.id)) continue;
          if (swipedIdsRef.current.has(n.id)) continue;
          merged.push(n);
        }
        if (merged.length === 0 && j.names.length === 0) setExhausted(true);
        else setExhausted(false);
        return merged;
      });
    } catch (e) {
      toast.error("Could not load names. Try again.");
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMore();
  }, [fetchMore]);

  // Rebind the guard if the active identity changes in place (e.g. switched in
  // Settings without a remount), so one partner's set never leaks to the other.
  useEffect(() => {
    swipedIdsRef.current = sessionSwipedSet(user);
  }, [user]);

  useEffect(() => {
    if (!loading && queue.length > 0 && queue.length < 5 && !exhausted) {
      fetchMore();
    }
  }, [queue.length, loading, exhausted, fetchMore]);

  useEffect(() => {
    let cancelled = false;
    const checkSeed = async () => {
      try {
        const r = await apiFetch("/api/shuffle");
        if (!r.ok) return;
        const j = (await r.json()) as { enabled: boolean; seed: number };
        if (cancelled) return;
        if (seedRef.current === null) {
          seedRef.current = j.seed;
          return;
        }
        if (j.seed !== seedRef.current) {
          seedRef.current = j.seed;
          toast.message(j.enabled ? "Names shuffled" : "Back to A to Z", {
            description: "Your partner changed the order.",
            duration: 2500,
          });
          fetchMore(true);
        }
      } catch {}
    };
    checkSeed();
    const id = window.setInterval(checkSeed, 15000);
    const onFocus = () => checkSeed();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchMore]);

  const handleSwipe = useCallback(
    async (item: NameItem, decision: "like" | "pass") => {
      if (swipedIdsRef.current.has(item.id)) return;
      swipedIdsRef.current.add(item.id);
      setQueue((q) => q.filter((n) => n.id !== item.id));
      vibrate(15);
      try {
        const r = await apiFetch("/api/swipe", {
          method: "POST",
          body: JSON.stringify({ nameId: item.id, decision }),
        });
        if (!r.ok) throw new Error("swipe failed");
        const j = (await r.json()) as
          | { isMatch: true; name: NameItem }
          | { isMatch: false };
        setHasSwipes(true);
        if (decision === "like" && j.isMatch) {
          setMatchName(j.name);
        } else if (decision === "like") {
          toast.success(`Liked ${item.name}`, { duration: 1300 });
        } else {
          toast.error(`Passed ${item.name}`, { duration: 1300 });
        }
      } catch {
        toast.error("Swipe did not save. Reloading.");
        swipedIdsRef.current.delete(item.id);
        setQueue((q) => (q.some((n) => n.id === item.id) ? q : [item, ...q]));
      }
    },
    []
  );

  const handleUndo = useCallback(async () => {
    if (undoBusy) return;
    setUndoBusy(true);
    try {
      const r = await apiFetch("/api/swipe/undo", { method: "POST" });
      if (r.status === 404) {
        toast.message("Nothing to undo");
        setHasSwipes(false);
        return;
      }
      if (!r.ok) throw new Error();
      const j = (await r.json()) as {
        undone: true;
        name: NameItem;
        decision: "like" | "pass";
        wasMatch: boolean;
      };
      swipedIdsRef.current.delete(j.name.id);
      setQueue((q) => {
        if (q.some((n) => n.id === j.name.id)) return q;
        return [j.name, ...q];
      });
      setExhausted(false);
      toast.success(
        j.wasMatch
          ? `Brought back ${j.name.name} — match removed`
          : `Brought back ${j.name.name}`,
        { duration: 1800 }
      );
    } catch {
      toast.error("Could not undo. Try again.");
    } finally {
      setUndoBusy(false);
    }
  }, [undoBusy]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { swipedByMe: number } | null) => {
        if (cancelled || !j) return;
        setHasSwipes(j.swipedByMe > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const top = queue[0];
  const stackBelow = queue.slice(1, 3);

  useEffect(() => {
    if (!top) return;
    const id = top.id;
    // One request per card for meaning + variants + popularity (was three).
    if (metaCache[id] && variantsCache[id] && popCache[id]) return;
    if (detailInflightRef.current.has(id)) return;
    detailInflightRef.current.add(id);
    apiFetch(`/api/names/${id}/detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { meta: Meta; variants: Variant[]; popularity: Popularity } | null) => {
        if (!j) return;
        if (j.meta) setMetaCache((c) => ({ ...c, [id]: j.meta }));
        if (j.variants) setVariantsCache((c) => ({ ...c, [id]: j.variants }));
        if (j.popularity) setPopCache((c) => ({ ...c, [id]: j.popularity }));
      })
      .catch(() => {})
      .finally(() => detailInflightRef.current.delete(id));
  }, [top, metaCache, variantsCache, popCache]);

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-2 min-h-0">
      <header className="relative text-center mb-4">
        <h1 className="font-serif text-3xl text-stone-800">Names Match</h1>
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-stone-500">
          <span>
            {total !== null
              ? exhausted && queue.length === 0
                ? "You have seen them all."
                : `${total} names total`
              : "Loading"}
          </span>
          {shuffled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200/70 text-amber-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Shuffled
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleUndo}
          disabled={!hasSwipes || undoBusy}
          aria-label="Undo last swipe"
          className="absolute right-0 top-1 inline-flex items-center justify-center gap-1.5 h-10 min-w-[44px] px-3 rounded-full border border-stone-200 bg-white/80 backdrop-blur text-stone-700 shadow-sm text-xs font-medium active:scale-[0.96] transition disabled:opacity-40 disabled:active:scale-100"
        >
          <RotateCcw size={14} className={undoBusy ? "animate-spin" : ""} />
          Undo
        </button>
      </header>

      <div className="relative flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="relative w-full max-w-[380px] aspect-[3/4]">
          {loading && queue.length === 0 ? (
            <SkeletonCard />
          ) : !top ? (
            <EmptyState onGenerated={() => fetchMore(true)} />
          ) : (
            <>
              {stackBelow.map((item, idx) => (
                <BehindCard key={item.id} index={idx + 1} />
              ))}
              <AnimatePresence initial={false} mode="popLayout">
                <FrontCard
                  key={top.id}
                  item={top}
                  onSwipe={handleSwipe}
                  palette={palettes[top.id % palettes.length]}
                  surname={surname}
                  meta={metaCache[top.id]}
                  variants={variantsCache[top.id]}
                  popularity={popCache[top.id]}
                />
              </AnimatePresence>
            </>
          )}
        </div>

        {top && (
          <div className="mt-5 flex items-center justify-center gap-6 w-full">
            <button
              type="button"
              onClick={() => handleSwipe(top, "pass")}
              aria-label="Pass"
              className="h-16 w-16 rounded-full bg-white border border-stone-200 shadow-md flex items-center justify-center text-rose-500 active:scale-90 transition"
            >
              <X size={28} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={() => handleSwipe(top, "like")}
              aria-label="Like"
              className="h-16 w-16 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-500/30 flex items-center justify-center text-white active:scale-90 transition"
            >
              <Heart size={26} fill="white" />
            </button>
          </div>
        )}
      </div>

      <MatchOverlay name={matchName} surname={surname} onDismiss={() => setMatchName(null)} />
    </div>
  );
}

function BehindCard({ index }: { index: number }) {
  const scale = 1 - index * 0.05;
  const translate = index * 8;
  return (
    <div
      className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-100 to-rose-100 border border-stone-200/70 shadow-sm"
      style={{
        transform: `translateY(${translate}px) scale(${scale})`,
        opacity: 1 - index * 0.18,
      }}
    />
  );
}

function FrontCard({
  item,
  onSwipe,
  palette,
  surname,
  meta,
  variants,
  popularity,
}: {
  item: NameItem;
  onSwipe: (item: NameItem, decision: "like" | "pass") => void;
  palette: string;
  surname: string;
  meta?: Meta;
  variants?: Variant[];
  popularity?: Popularity;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [30, 100], [0, 1]);
  const passOpacity = useTransform(x, [-100, -30], [1, 0]);

  const fly = (direction: "like" | "pass") => {
    // Nudge x so the exit animation flies the correct way even for button taps,
    // where the card was never dragged and x is still 0 (which read as "right").
    x.set(direction === "pass" ? -1 : 1);
    onSwipe(item, direction);
  };

  return (
    <motion.div
      drag="x"
      dragElastic={0.18}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 600, bounceDamping: 28, power: 0.15, timeConstant: 200 }}
      style={{ x, rotate }}
      initial={{ scale: 0.95, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.6 }}
      exit={{ x: x.get() < 0 ? -600 : 600, opacity: 0, transition: { duration: 0.22, ease: "easeOut" } }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY) {
          fly("like");
        } else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY) {
          fly("pass");
        }
      }}
      className={`absolute inset-0 select-none touch-none rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-900/5 bg-gradient-to-br ${palette} flex flex-col cursor-grab active:cursor-grabbing`}
    >
      <motion.div
        style={{ opacity: likeOpacity, pointerEvents: "none" }}
        className="absolute top-5 left-5 px-3 py-1.5 border-2 border-emerald-500 text-emerald-600 font-bold uppercase tracking-widest rounded-md -rotate-12 text-sm"
      >
        Like
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity, pointerEvents: "none" }}
        className="absolute top-5 right-5 px-3 py-1.5 border-2 border-rose-500 text-rose-600 font-bold uppercase tracking-widest rounded-md rotate-12 text-sm"
      >
        Pass
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pointer-events-none">
        <p className="text-xs uppercase tracking-widest text-stone-500">Name</p>
        <p className="mt-1 text-xs text-stone-500">#{item.id}</p>
        <h2 className="mt-5 font-serif text-[56px] leading-none text-stone-900 break-words">
          {item.name}
        </h2>
        {surname ? (
          <>
            <p className="mt-3 font-serif text-2xl leading-none text-stone-600 break-words">
              {surname}
            </p>
            {(() => {
              const i = flagInitials(item.name, surname);
              return (
                <p
                  className={`mt-2 text-[10px] tracking-widest uppercase ${
                    i.flagged ? "text-rose-600 font-semibold" : "text-stone-500"
                  }`}
                >
                  Initials: {i.initials}
                  {i.flagged ? " ⚠" : ""}
                </p>
              );
            })()}
          </>
        ) : null}
        {meta && (meta.origin || meta.meaning) ? (
          <p className="mt-4 text-xs text-stone-600 max-w-[260px]">
            {meta.origin ? <span className="font-medium">{meta.origin}</span> : null}
            {meta.origin && meta.meaning ? <span className="mx-1.5">·</span> : null}
            {meta.meaning ? <span className="italic">&ldquo;{meta.meaning}&rdquo;</span> : null}
          </p>
        ) : null}
        {popularity && (popularity.rank || popularity.blurb) ? (
          <PopularityChip rank={popularity.rank} blurb={popularity.blurb} />
        ) : null}
        {variants && variants.length > 0 ? (
          <p className="mt-3 text-[11px] text-stone-500 max-w-[260px]">
            Also spelled: {variants.map((v) => v.name).join(", ")}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

function PopularityChip({ rank, blurb }: { rank: number | null; blurb: string | null }) {
  let chipClass = "bg-stone-100 text-stone-700 border-stone-200";
  let label: string | null = null;

  if (rank !== null) {
    if (rank <= 10) {
      chipClass = "bg-amber-100 text-amber-800 border-amber-300";
      label = `Top 10 UK · #${rank}`;
    } else if (rank <= 30) {
      chipClass = "bg-sky-100 text-sky-800 border-sky-300";
      label = `Top 30 UK · #${rank}`;
    } else {
      chipClass = "bg-stone-100 text-stone-700 border-stone-300";
      label = `Top 100 UK · #${rank}`;
    }
  } else if (blurb) {
    label = blurb;
  }

  if (!label) return null;

  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider border ${chipClass}`}
      >
        🇬🇧 {label}
      </span>
      {rank !== null && blurb ? (
        <span className="text-[10px] text-stone-500 max-w-[240px]">{blurb}</span>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-100 to-rose-100 border border-stone-200/70 animate-pulse" />
  );
}

function EmptyState({ onGenerated }: { onGenerated: () => void }) {
  const [stats, setStats] = useState<{
    likedByMe: number;
    totalMatches: number;
  } | null>(null);
  const [pendingMine, setPendingMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setStats({ likedByMe: j.likedByMe, totalMatches: j.totalMatches });
      })
      .catch(() => {});
    apiFetch("/api/likes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setPendingMine(j.mine.length);
      })
      .catch(() => {});
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/names/generate", {
        method: "POST",
        body: JSON.stringify({ count: 30 }),
      });
      const j = (await r.json()) as { added?: number; error?: string };
      if (!r.ok || j.error) {
        toast.error(j.error || "Generation failed.");
        return;
      }
      if (!j.added) {
        toast.message("AI returned only duplicates. Try a style hint in Settings.");
        return;
      }
      toast.success(`Added ${j.added} new name${j.added === 1 ? "" : "s"}`);
      onGenerated();
    } catch {
      toast.error("Could not reach the AI.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 rounded-3xl border border-dashed border-stone-300 bg-white/70 flex flex-col items-center justify-center text-center px-6 py-8 overflow-y-auto">
      <div className="text-5xl">🎉</div>
      <p className="mt-4 font-serif text-2xl text-stone-800">You are all caught up.</p>
      <p className="mt-2 text-sm text-stone-500 max-w-[280px]">
        Every name in the deck has had your verdict.
      </p>

      {stats && (
        <div className="mt-5 grid grid-cols-3 gap-2 w-full max-w-[300px]">
          <Stat label="Liked" value={stats.likedByMe} />
          <Stat label="Matches" value={stats.totalMatches} highlight />
          <Stat label="Pending" value={pendingMine ?? 0} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 w-full max-w-[280px]">
        <Link
          href="/matches"
          className="rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-medium py-3 min-h-[44px] text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
        >
          <ListChecks size={16} />
          View matches
        </Link>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="rounded-2xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium py-3 min-h-[44px] text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50"
        >
          <Sparkles size={16} className={busy ? "animate-pulse" : ""} />
          {busy ? "Generating…" : "Generate 30 more with AI"}
        </button>
        <Link
          href="/settings"
          className="text-xs text-stone-500 underline mt-1"
        >
          More options in Settings
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-2 ${
        highlight ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-white/70"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div
        className={`mt-0.5 font-serif text-xl ${
          highlight ? "text-rose-600" : "text-stone-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
