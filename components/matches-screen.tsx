"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Trash2 } from "lucide-react";
import { apiFetch } from "@/components/user-provider";
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

type Match = { id: number; name: string; matchedAt: string };

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [selected, setSelected] = useState<Match | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/matches");
      if (!r.ok) return;
      const j = (await r.json()) as { matches: Match[] };
      setMatches(j.matches);
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

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-2 min-h-0">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-3xl text-stone-800">Matches</h1>
          <p className="text-xs text-stone-500 mt-1">Names you both like.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-rose-100 text-rose-700 px-3 py-1.5 text-sm font-medium">
          <Heart size={14} className="fill-rose-500 text-rose-500" />
          <span>{matches?.length ?? "…"}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 -mx-5 px-5 pb-6">
        {matches === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-stone-200/70 animate-pulse" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-12 text-center px-6">
            <div className="text-5xl">💕</div>
            <p className="mt-4 font-serif text-2xl text-stone-800">No matches yet.</p>
            <p className="mt-2 text-sm text-stone-500">
              Keep swiping and they will show up here.
            </p>
          </div>
        ) : (
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
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className="w-full text-left rounded-2xl border border-stone-200/70 bg-white/80 backdrop-blur p-4 flex items-center justify-between gap-4 shadow-sm active:scale-[0.99] transition"
                  >
                    <div>
                      <div className="font-serif text-2xl text-stone-900">{m.name}</div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        Matched {timeAgo(m.matchedAt)}
                      </div>
                    </div>
                    <Heart className="fill-rose-500 text-rose-500" size={20} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-amber-50 border-stone-200">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-5xl text-center text-stone-900">
                  {selected.name}
                </DialogTitle>
                <DialogDescription className="text-center text-stone-600">
                  Matched {timeAgo(selected.matchedAt)}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col gap-2 sm:flex-col">
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
