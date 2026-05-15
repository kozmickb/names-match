"use client";

import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/components/user-provider";
import { MatchOverlay } from "@/components/match-overlay";

type NameItem = { id: number; name: string };

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

export function SwipeStack() {
  const [queue, setQueue] = useState<NameItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [shuffled, setShuffled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [matchName, setMatchName] = useState<NameItem | null>(null);
  const fetchingRef = useRef(false);
  const inflightRef = useRef(false);
  const seedRef = useRef<number | null>(null);

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
          if (!seen.has(n.id)) merged.push(n);
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
      if (inflightRef.current) return;
      inflightRef.current = true;
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
        if (decision === "like" && j.isMatch) {
          setMatchName(j.name);
        } else {
          toast.success(decision === "like" ? `Liked ${item.name}` : `Passed ${item.name}`, {
            duration: 1300,
          });
        }
      } catch {
        toast.error("Swipe did not save. Reloading.");
        setQueue((q) => [item, ...q]);
      } finally {
        inflightRef.current = false;
      }
    },
    []
  );

  const top = queue[0];
  const stackBelow = queue.slice(1, 3);

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-2 min-h-0">
      <header className="text-center mb-4">
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
      </header>

      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <div className="relative w-full max-w-[380px] aspect-[3/4]">
          {loading && queue.length === 0 ? (
            <SkeletonCard />
          ) : !top ? (
            <EmptyState />
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
                />
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      <MatchOverlay name={matchName} onDismiss={() => setMatchName(null)} />
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
}: {
  item: NameItem;
  onSwipe: (item: NameItem, decision: "like" | "pass") => void;
  palette: string;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [30, 100], [0, 1]);
  const passOpacity = useTransform(x, [-100, -30], [1, 0]);

  const fly = (direction: "like" | "pass") => {
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
      className={`absolute inset-0 select-none touch-pan-y rounded-3xl border border-stone-200/70 shadow-xl shadow-stone-900/5 bg-gradient-to-br ${palette} flex flex-col`}
    >
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-5 left-5 px-3 py-1.5 border-2 border-emerald-500 text-emerald-600 font-bold uppercase tracking-widest rounded-md -rotate-12 text-sm"
      >
        Like
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-5 right-5 px-3 py-1.5 border-2 border-rose-500 text-rose-600 font-bold uppercase tracking-widest rounded-md rotate-12 text-sm"
      >
        Pass
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-widest text-stone-500">Name</p>
        <p className="mt-1 text-xs text-stone-500">#{item.id}</p>
        <h2 className="mt-6 font-serif text-[56px] leading-none text-stone-900 break-words">
          {item.name}
        </h2>
      </div>

      <div className="px-5 pb-6 pt-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => fly("pass")}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white/70 backdrop-blur py-3 min-h-[48px] text-stone-700 active:scale-[0.97] transition"
        >
          <X size={18} />
          <span>Pass</span>
        </button>
        <button
          type="button"
          onClick={() => fly("like")}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-rose-500 text-white py-3 min-h-[48px] shadow-lg shadow-rose-500/30 active:scale-[0.97] transition"
        >
          <Heart size={18} />
          <span>Like</span>
        </button>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-100 to-rose-100 border border-stone-200/70 animate-pulse" />
  );
}

function EmptyState() {
  return (
    <div className="absolute inset-0 rounded-3xl border border-dashed border-stone-300 bg-white/60 flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl">🎉</div>
      <p className="mt-4 font-serif text-2xl text-stone-800">All swiped.</p>
      <p className="mt-2 text-sm text-stone-500">
        Check matches to see what you both liked.
      </p>
    </div>
  );
}
