"use client";

import { apiFetch, useUser } from "@/components/user-provider";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Swords, X, Trophy } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type NameRef = { id: number; name: string };
type Pair = { left: NameRef; right: NameRef };
type Stats = {
  totalMatches: number;
  totalPairs: number;
  donePairs: number;
  reason: string | null;
};
type Standing = {
  id: number;
  name: string;
  gender: string | null;
  played: number;
  won: number;
  lost: number;
  points: number;
  winRate: number;
  karoWon: number;
  karoLost: number;
  lucyWon: number;
  lucyLost: number;
};
type Standings = { boys: Standing[]; girls: Standing[] };
type League = "boys" | "girls";

// How many of the top of the table "qualify" — a clean power of two for a
// future knockout bracket.
function qualifyCount(n: number): number {
  if (n >= 8) return 8;
  if (n >= 4) return 4;
  if (n >= 2) return 2;
  return 0;
}

export function TournamentScreen() {
  const { surname } = useUser();
  const [league, setLeague] = useState<League>("boys");
  const [standings, setStandings] = useState<Standings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [nextPair, setNextPair] = useState<Pair | null>(null);
  const [duel, setDuel] = useState<Pair | null>(null);
  const [selected, setSelected] = useState<NameRef | null>(null);
  const [voting, setVoting] = useState(false);

  const loadStandings = useCallback(async () => {
    try {
      const r = await apiFetch("/api/tournament/standings");
      if (!r.ok) return;
      const j = (await r.json()) as Standings;
      setStandings({ boys: j.boys ?? [], girls: j.girls ?? [] });
    } catch {}
  }, []);

  const loadPair = useCallback(async (lg: League) => {
    try {
      const r = await apiFetch(`/api/tournament/pair?gender=${lg}`);
      if (!r.ok) return;
      const j = (await r.json()) as {
        pair: Pair | null;
        reason?: string;
        totalMatches: number;
        totalPairs?: number;
        donePairs?: number;
      };
      setNextPair(j.pair);
      setStats({
        totalMatches: j.totalMatches,
        totalPairs: j.totalPairs ?? 0,
        donePairs: j.donePairs ?? 0,
        reason: j.reason ?? null,
      });
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadStandings();
  }, [loadStandings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch on league change
    loadPair(league);
  }, [league, loadPair]);

  const vote = async (winner: NameRef, loser: NameRef) => {
    setVoting(true);
    try {
      const r = await apiFetch("/api/tournament/vote", {
        method: "POST",
        body: JSON.stringify({ winnerId: winner.id, loserId: loser.id }),
      });
      if (!r.ok) throw new Error();
      toast.success(`Picked ${winner.name}`, { duration: 900 });
      setDuel(null);
      setSelected(null);
      await Promise.all([loadStandings(), loadPair(league)]);
    } catch {
      toast.error("Could not save vote.");
    } finally {
      setVoting(false);
    }
  };

  const onSelectRow = (row: NameRef) => {
    if (!selected) {
      setSelected(row);
      return;
    }
    if (selected.id === row.id) {
      setSelected(null);
      return;
    }
    setDuel({ left: selected, right: row });
    setSelected(null);
  };

  const rows = standings ? standings[league] : null;
  const qCount = rows ? qualifyCount(rows.length) : 0;
  const complete = stats?.reason === "complete";
  const notEnough = stats?.reason === "not_enough_matches";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 pt-6">
        <header className="flex items-center justify-between mb-3">
          <Link
            href="/matches"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-stone-200 bg-white/80 text-stone-700 text-xs font-medium"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <div className="text-center flex-1 px-2">
            <h1 className="font-serif text-2xl text-stone-800">Top picks</h1>
            {stats && !notEnough && (
              <p className="text-xs text-stone-500 mt-0.5">
                Group stage · {stats.donePairs}/{stats.totalPairs} matches played
              </p>
            )}
          </div>
          <div className="w-[68px]" aria-hidden />
        </header>

        <div className="mb-3 flex justify-center">
          <div className="inline-flex rounded-full border border-stone-200 bg-white/80 p-1">
            {(["boys", "girls"] as League[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setLeague(g);
                  setSelected(null);
                }}
                className={`h-8 px-4 rounded-full text-xs font-semibold transition ${
                  league === g
                    ? g === "boys"
                      ? "bg-sky-500 text-white"
                      : "bg-rose-500 text-white"
                    : "text-stone-500"
                }`}
              >
                {g === "boys" ? "👦 Boys" : "👧 Girls"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-4">
        {standings === null ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-stone-200/70 animate-pulse" />
            ))}
          </div>
        ) : notEnough ? (
          <EmptyMessage
            icon="🤝"
            title="Not enough matches yet"
            body="You need at least two mutual matches in this league before you can run a tournament."
          />
        ) : rows && rows.length > 0 ? (
          <>
            <p className="text-center text-[11px] text-stone-400 mb-2">
              Tap two names to play them off
            </p>
            <LeagueTable
              rows={rows}
              accent={league}
              surname={surname}
              qualifyCount={qCount}
              selectedId={selected?.id ?? null}
              onSelect={onSelectRow}
            />
          </>
        ) : (
          <EmptyMessage
            icon="📭"
            title="No standings yet"
            body="Match some names and play a few matches to build this league."
          />
        )}
      </div>

      {rows && rows.length > 0 && (
        <div className="px-5 pb-3 pt-2 border-t border-stone-200/70 bg-amber-50/60 backdrop-blur">
          {complete ? (
            <div className="text-center">
              <p className="text-sm font-medium text-stone-700">
                <Trophy size={14} className="inline -mt-0.5 mr-1 text-amber-500" />
                Group stage complete
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Knockouts coming soon — tap two names above to replay any duel.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => nextPair && setDuel(nextPair)}
              disabled={voting || !nextPair}
              className="w-full h-12 rounded-full bg-stone-800 text-white text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-50 transition inline-flex items-center justify-center gap-2"
            >
              <Swords size={16} />
              Play next match
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {duel && (
          <DuelOverlay
            duel={duel}
            surname={surname}
            voting={voting}
            onPick={vote}
            onClose={() => setDuel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LeagueTable({
  rows,
  accent,
  surname,
  qualifyCount,
  selectedId,
  onSelect,
}: {
  rows: Standing[];
  accent: League;
  surname: string;
  qualifyCount: number;
  selectedId: number | null;
  onSelect: (row: NameRef) => void;
}) {
  const accentText = accent === "boys" ? "text-sky-600" : "text-rose-600";
  const cols = "grid grid-cols-[1.75rem_1fr_1.75rem_1.75rem_1.75rem_2.25rem] items-center gap-1";

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div
        className={`${cols} px-3 py-2 border-b border-stone-100 text-[10px] font-semibold uppercase tracking-wider text-stone-400`}
      >
        <span className="text-center">#</span>
        <span>Name</span>
        <span className="text-center">P</span>
        <span className="text-center">W</span>
        <span className="text-center">L</span>
        <span className="text-center">Pts</span>
      </div>
      <ul>
        {rows.map((r, i) => {
          const qualified = i < qualifyCount;
          const isSelected = selectedId === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect({ id: r.id, name: r.name })}
                className={`w-full text-left ${cols} px-3 py-2.5 border-b border-stone-100 last:border-0 border-l-2 transition ${
                  qualified ? "border-l-emerald-400" : "border-l-transparent"
                } ${
                  isSelected
                    ? "bg-amber-100 ring-2 ring-amber-400 ring-inset"
                    : i === 0
                    ? "bg-amber-50/70"
                    : "active:bg-stone-50"
                }`}
              >
                <span className="flex justify-center">
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? "bg-amber-400 text-white"
                        : i === 1
                        ? "bg-stone-300 text-stone-700"
                        : i === 2
                        ? "bg-orange-300 text-white"
                        : "text-stone-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-lg leading-tight text-stone-900">
                    {i === 0 ? "🏆 " : ""}
                    {r.name}
                    {surname ? <span className="text-stone-400"> {surname}</span> : null}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    K {r.karoWon}-{r.karoLost} · L {r.lucyWon}-{r.lucyLost} ·{" "}
                    {r.played ? `${Math.round(r.winRate * 100)}%` : "—"}
                  </span>
                </span>
                <span className="text-center text-sm tabular-nums text-stone-500">{r.played}</span>
                <span className="text-center text-sm tabular-nums text-stone-700">{r.won}</span>
                <span className="text-center text-sm tabular-nums text-stone-500">{r.lost}</span>
                <span className={`text-center text-sm font-bold tabular-nums ${accentText}`}>
                  {r.points}
                </span>
              </button>
              {qualifyCount > 0 && i === qualifyCount - 1 && i < rows.length - 1 && (
                <div className="relative">
                  <div className="border-t-2 border-dashed border-emerald-300" />
                  <span className="absolute right-3 -top-2 bg-white px-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                    Qualification
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DuelOverlay({
  duel,
  surname,
  voting,
  onPick,
  onClose,
}: {
  duel: Pair;
  surname: string;
  voting: boolean;
  onPick: (winner: NameRef, loser: NameRef) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-stone-900/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="rounded-t-3xl bg-amber-50 px-5 pb-8 pt-4"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-widest text-stone-500">Which do you prefer?</span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-stone-500 active:bg-stone-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <PickButton
            name={duel.left}
            surname={surname}
            disabled={voting}
            onClick={() => onPick(duel.left, duel.right)}
          />
          <div className="text-center text-stone-500 text-sm font-medium">vs</div>
          <PickButton
            name={duel.right}
            surname={surname}
            disabled={voting}
            onClick={() => onPick(duel.right, duel.left)}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function PickButton({
  name,
  surname,
  disabled,
  onClick,
}: {
  name: NameRef;
  surname: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-3xl border border-stone-200 bg-gradient-to-br from-amber-50 to-rose-50 py-7 px-6 text-center shadow-md active:scale-[0.97] disabled:opacity-60 transition"
    >
      <div className="font-serif text-4xl text-stone-900">{name.name}</div>
      {surname ? <div className="font-serif text-xl text-stone-500 mt-1">{surname}</div> : null}
    </button>
  );
}

function EmptyMessage({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="text-center px-6 pt-10">
      <div className="text-5xl">{icon}</div>
      <p className="mt-3 font-serif text-2xl text-stone-800">{title}</p>
      <p className="mt-2 text-sm text-stone-500 max-w-[300px] mx-auto">{body}</p>
    </div>
  );
}
