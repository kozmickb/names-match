"use client";

import { apiFetch, useUser } from "@/components/user-provider";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type Pair = { left: { id: number; name: string }; right: { id: number; name: string } };
type Stats = { totalMatches: number; totalPairs: number; donePairs: number };
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

export function TournamentScreen() {
  const { surname } = useUser();
  const [pair, setPair] = useState<Pair | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [standings, setStandings] = useState<Standings | null>(null);
  const [league, setLeague] = useState<League>("boys");
  const [showResults, setShowResults] = useState(false);

  const loadPair = useCallback(async () => {
    try {
      const r = await apiFetch("/api/tournament/pair");
      if (!r.ok) return;
      const j = (await r.json()) as {
        pair: Pair | null;
        reason?: string;
        totalMatches: number;
        totalPairs?: number;
        donePairs?: number;
      };
      setPair(j.pair);
      setStats({
        totalMatches: j.totalMatches,
        totalPairs: j.totalPairs ?? 0,
        donePairs: j.donePairs ?? 0,
      });
      setReason(j.reason ?? null);
    } catch {}
  }, []);

  const loadResults = useCallback(async () => {
    try {
      const r = await apiFetch("/api/tournament/standings");
      if (!r.ok) return;
      const j = (await r.json()) as Standings;
      setStandings({ boys: j.boys ?? [], girls: j.girls ?? [] });
    } catch {}
  }, []);

  useEffect(() => {
    loadPair();
    loadResults();
  }, [loadPair, loadResults]);

  const vote = async (winner: { id: number; name: string }, loser: { id: number; name: string }) => {
    setVoting(true);
    try {
      const r = await apiFetch("/api/tournament/vote", {
        method: "POST",
        body: JSON.stringify({ winnerId: winner.id, loserId: loser.id }),
      });
      if (!r.ok) throw new Error();
      toast.success(`Picked ${winner.name}`, { duration: 900 });
      await Promise.all([loadPair(), loadResults()]);
    } catch {
      toast.error("Could not save vote.");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-2 min-h-0">
      <header className="flex items-center justify-between mb-4">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-stone-200 bg-white/80 text-stone-700 text-xs font-medium"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        <div className="text-center flex-1 px-2">
          <h1 className="font-serif text-2xl text-stone-800">Top picks</h1>
          {stats && (
            <p className="text-xs text-stone-500 mt-0.5">
              {stats.donePairs} / {stats.totalPairs} pairs decided
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowResults((s) => !s)}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-stone-200 bg-white/80 text-stone-700 text-xs font-medium"
        >
          <Trophy size={14} />
          {showResults ? "Vote" : "Results"}
        </button>
      </header>

      {!showResults ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          {reason === "not_enough_matches" && (
            <EmptyMessage
              icon="🤝"
              title="Not enough matches yet"
              body="You need at least two mutual matches before you can run a tournament."
            />
          )}
          {reason === "complete" && (
            <EmptyMessage
              icon="🏆"
              title="Every pair voted"
              body="Check Results to see your top picks. Match more names to keep going."
            />
          )}
          {pair && (
            <div className="w-full max-w-md">
              <p className="text-center text-xs uppercase tracking-widest text-stone-500 mb-4">
                Which do you prefer?
              </p>
              <div className="grid grid-cols-1 gap-3">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={`${pair.left.id}-${pair.right.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="grid grid-cols-1 gap-3"
                  >
                    <PickButton
                      name={pair.left}
                      surname={surname}
                      disabled={voting}
                      onClick={() => vote(pair.left, pair.right)}
                    />
                    <p className="text-center text-stone-500 text-sm">or</p>
                    <PickButton
                      name={pair.right}
                      surname={surname}
                      disabled={voting}
                      onClick={() => vote(pair.right, pair.left)}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
              <button
                type="button"
                onClick={loadPair}
                disabled={voting}
                className="mt-5 mx-auto block text-xs text-stone-500 underline"
              >
                <span className="inline-flex items-center gap-1">
                  <RefreshCw size={12} />
                  Show another pair
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 -mx-5 px-5 pb-6">
          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-full border border-stone-200 bg-white/80 p-1">
              {(["boys", "girls"] as League[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setLeague(g)}
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

          {standings === null ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-stone-200/70 animate-pulse" />
              ))}
            </div>
          ) : (
            <LeagueTable rows={standings[league]} accent={league} surname={surname} />
          )}
        </div>
      )}
    </div>
  );
}

function LeagueTable({
  rows,
  accent,
  surname,
}: {
  rows: Standing[];
  accent: League;
  surname: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyMessage
        icon="📭"
        title="No standings yet"
        body="Match some names and vote on a few pairs to build this league."
      />
    );
  }

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
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`${cols} px-3 py-2.5 border-b border-stone-100 last:border-0 ${
              i === 0 ? "bg-amber-50/70" : ""
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
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickButton({
  name,
  surname,
  disabled,
  onClick,
}: {
  name: { id: number; name: string };
  surname: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-3xl border border-stone-200 bg-gradient-to-br from-amber-50 to-rose-50 py-8 px-6 text-center shadow-md active:scale-[0.97] disabled:opacity-60 transition"
    >
      <div className="font-serif text-4xl text-stone-900">{name.name}</div>
      {surname ? (
        <div className="font-serif text-xl text-stone-500 mt-1">{surname}</div>
      ) : null}
    </button>
  );
}

function EmptyMessage({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="text-center px-6">
      <div className="text-5xl">{icon}</div>
      <p className="mt-3 font-serif text-2xl text-stone-800">{title}</p>
      <p className="mt-2 text-sm text-stone-500 max-w-[300px] mx-auto">{body}</p>
    </div>
  );
}
