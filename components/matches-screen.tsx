"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Trash2, Star, Share2, Clock, Sparkles } from "lucide-react";
import { apiFetch, useUser } from "@/components/user-provider";
import { timeAgo } from "@/lib/time";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Match = {
  id: number;
  name: string;
  matchedAt: string;
  myFavourite: boolean;
  partnerFavourite: boolean;
};

type Pending = { id: number; name: string; likedAt: string };

type Tab = "matches" | "mine" | "theirs";

export function MatchesScreen() {
  const { surname, user } = useUser();
  const [tab, setTab] = useState<Tab>("matches");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [mine, setMine] = useState<Pending[] | null>(null);
  const [theirs, setTheirs] = useState<Pending[] | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        apiFetch("/api/matches"),
        apiFetch("/api/likes"),
      ]);
      if (mRes.ok) {
        const j = (await mRes.json()) as { matches: Match[] };
        setMatches(j.matches);
      }
      if (lRes.ok) {
        const j = (await lRes.json()) as { mine: Pending[]; awaitingMe: Pending[] };
        setMine(j.mine);
        setTheirs(j.awaitingMe);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const remove = async () => {
    if (!selected) return;
    setRemoving(true);
    try {
      const r = await apiFetch(`/api/matches/${selected.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setMatches((m) => m?.filter((x) => x.id !== selected.id) ?? null);
      toast.success(`Removed ${selected.name} from matches`);
      setSelected(null);
    } catch {
      toast.error("Could not remove match.");
    } finally {
      setRemoving(false);
    }
  };

  const toggleFav = async (m: Match, next: boolean) => {
    setMatches((cur) =>
      cur?.map((x) => (x.id === m.id ? { ...x, myFavourite: next } : x)) ?? null
    );
    try {
      const r = await apiFetch(`/api/favourites/${m.id}`, {
        method: "POST",
        body: JSON.stringify({ favourite: next }),
      });
      if (!r.ok) throw new Error();
      if (next) toast.success(`Starred ${m.name}`, { duration: 1200 });
      load();
    } catch {
      toast.error("Could not save favourite.");
      setMatches((cur) =>
        cur?.map((x) => (x.id === m.id ? { ...x, myFavourite: !next } : x)) ?? null
      );
    }
  };

  const share = async () => {
    if (!matches || matches.length === 0) {
      toast.message("No matches to share yet.");
      return;
    }
    const lines = matches.map(
      (m) =>
        `${m.myFavourite ? "★ " : "  "}${m.name}${surname ? ` ${surname}` : ""}`
    );
    const text = `Our baby name matches (${matches.length}):\n\n${lines.join("\n")}`;
    const nav = navigator as Navigator & {
      share?: (data: { title: string; text: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "Names Match — our list", text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("List copied to clipboard");
    } catch {
      toast.error("Could not share or copy.");
    }
  };

  const tabCount = useMemo(
    () => ({
      matches: matches?.length ?? 0,
      mine: mine?.length ?? 0,
      theirs: theirs?.length ?? 0,
    }),
    [matches, mine, theirs]
  );

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-2 min-h-0">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-800">Matches</h1>
          <p className="text-xs text-stone-500 mt-1">Names you both like.</p>
        </div>
        <button
          type="button"
          onClick={share}
          aria-label="Share matches"
          className="inline-flex items-center justify-center gap-1.5 h-10 min-w-[44px] px-3 rounded-full border border-stone-200 bg-white/80 backdrop-blur text-stone-700 shadow-sm text-xs font-medium active:scale-[0.96] transition"
        >
          <Share2 size={14} />
          Share
        </button>
      </header>

      <div className="grid grid-cols-3 gap-1.5 mb-4 p-1 rounded-2xl bg-stone-200/60">
        <TabBtn active={tab === "matches"} onClick={() => setTab("matches")}>
          <Heart size={13} />
          <span>Matches</span>
          <Count n={tabCount.matches} active={tab === "matches"} />
        </TabBtn>
        <TabBtn active={tab === "mine"} onClick={() => setTab("mine")}>
          <Clock size={13} />
          <span>Pending</span>
          <Count n={tabCount.mine} active={tab === "mine"} />
        </TabBtn>
        <TabBtn active={tab === "theirs"} onClick={() => setTab("theirs")}>
          <Sparkles size={13} />
          <span>Their picks</span>
          <Count n={tabCount.theirs} active={tab === "theirs"} />
        </TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 -mx-5 px-5 pb-6">
        {tab === "matches" && (
          <MatchList
            matches={matches}
            surname={surname}
            onSelect={setSelected}
            onToggleFav={toggleFav}
          />
        )}
        {tab === "mine" && (
          <PendingList
            list={mine}
            surname={surname}
            emojiTitle="You like these"
            emptyText="You have not liked any names that are not yet matched."
            partnerLabel={`Waiting on ${user === "karo" ? "Lucy" : "Karo"}`}
          />
        )}
        {tab === "theirs" && (
          <PendingList
            list={theirs}
            surname={surname}
            emojiTitle="Their picks"
            emptyText="Nothing waiting for you."
            partnerLabel="Swipe and find out"
          />
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-amber-50 border-stone-200">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-5xl text-center text-stone-900">
                  {selected.name}
                  {surname ? (
                    <div className="text-3xl text-stone-500 mt-1">{surname}</div>
                  ) : null}
                </DialogTitle>
                <DialogDescription className="text-center text-stone-600">
                  Matched {timeAgo(selected.matchedAt)}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col gap-2 sm:flex-col">
                <Button
                  variant="outline"
                  onClick={() => toggleFav(selected, !selected.myFavourite)}
                  className="w-full"
                >
                  <Star
                    size={16}
                    className={
                      selected.myFavourite ? "fill-amber-400 text-amber-500" : ""
                    }
                  />
                  {selected.myFavourite ? "Unstar" : "Star as favourite"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={remove}
                  disabled={removing}
                  className="w-full"
                >
                  <Trash2 size={16} />
                  {removing ? "Removing…" : "Remove from matches"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelected(null)}
                  className="w-full"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 min-h-[40px] text-xs font-medium transition ${
        active ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full ${
        active ? "bg-rose-100 text-rose-700" : "bg-stone-300/70 text-stone-700"
      }`}
    >
      {n}
    </span>
  );
}

function MatchList({
  matches,
  surname,
  onSelect,
  onToggleFav,
}: {
  matches: Match[] | null;
  surname: string;
  onSelect: (m: Match) => void;
  onToggleFav: (m: Match, next: boolean) => void;
}) {
  if (matches === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-stone-200/70 animate-pulse" />
        ))}
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <div className="mt-12 text-center px-6">
        <div className="text-5xl">💕</div>
        <p className="mt-4 font-serif text-2xl text-stone-800">No matches yet.</p>
        <p className="mt-2 text-sm text-stone-500">
          Keep swiping and they will show up here.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {matches.map((m) => (
          <motion.li
            key={m.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="rounded-2xl border border-stone-200/70 bg-white/80 backdrop-blur p-4 flex items-center justify-between gap-3 shadow-sm">
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex-1 text-left active:scale-[0.99] transition"
              >
                <div className="font-serif text-2xl text-stone-900">
                  {m.name}
                  {surname ? <span className="text-stone-500"> {surname}</span> : null}
                </div>
                <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
                  <span>Matched {timeAgo(m.matchedAt)}</span>
                  {m.partnerFavourite ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                      <Star size={11} className="fill-amber-400" />
                      Their favourite
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onToggleFav(m, !m.myFavourite)}
                aria-label={m.myFavourite ? "Unstar" : "Star"}
                className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-stone-100 active:scale-95 transition"
              >
                <Star
                  size={20}
                  className={
                    m.myFavourite
                      ? "fill-amber-400 text-amber-500"
                      : "text-stone-400"
                  }
                />
              </button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function PendingList({
  list,
  surname,
  emojiTitle,
  emptyText,
  partnerLabel,
}: {
  list: Pending[] | null;
  surname: string;
  emojiTitle: string;
  emptyText: string;
  partnerLabel: string;
}) {
  if (list === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-stone-200/70 animate-pulse" />
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="mt-10 text-center px-6">
        <div className="text-4xl">🤍</div>
        <p className="mt-3 font-serif text-xl text-stone-800">{emojiTitle}</p>
        <p className="mt-1 text-sm text-stone-500">{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2.5">
      {list.map((p) => (
        <li
          key={p.id}
          className="rounded-2xl border border-stone-200/70 bg-white/70 p-3.5 flex items-center justify-between gap-3"
        >
          <div>
            <div className="font-serif text-xl text-stone-900">
              {p.name}
              {surname ? <span className="text-stone-500"> {surname}</span> : null}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">{partnerLabel}</div>
          </div>
          <span className="text-xs text-stone-400">{timeAgo(p.likedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
