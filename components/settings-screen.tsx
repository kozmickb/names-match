"use client";

import { apiFetch, useUser } from "@/components/user-provider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { displayName } from "@/lib/user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, LogOut, Trash2, Shuffle, ListOrdered, Sparkles } from "lucide-react";
import { timeAgo } from "@/lib/time";

type Stats = {
  totalNames: number;
  swipedByMe: number;
  likedByMe: number;
  totalMatches: number;
};

type ShuffleState = { enabled: boolean; seed: number; updatedAt: string | null };

export function SettingsScreen() {
  const { user, setUser, surname, setSurname } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [shuffle, setShuffle] = useState<ShuffleState | null>(null);
  const [shuffleBusy, setShuffleBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [style, setStyle] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsRes, shuffleRes] = await Promise.all([
        apiFetch("/api/stats"),
        apiFetch("/api/shuffle"),
      ]);
      if (statsRes.ok) setStats((await statsRes.json()) as Stats);
      if (shuffleRes.ok) setShuffle((await shuffleRes.json()) as ShuffleState);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenBusy(true);
    try {
      const r = await apiFetch("/api/names/generate", {
        method: "POST",
        body: JSON.stringify({ count: 30, style: style || undefined }),
      });
      const j = (await r.json()) as
        | { added: number; duplicates: number; generated: number }
        | { error: string };
      if (!r.ok || "error" in j) {
        toast.error("error" in j ? j.error : "Generation failed.");
        return;
      }
      if (j.added === 0) {
        toast.message("No new names this time", {
          description: `Generated ${j.generated}, all already in your list.`,
        });
      } else {
        toast.success(`Added ${j.added} new name${j.added === 1 ? "" : "s"}`, {
          description:
            j.duplicates > 0
              ? `${j.duplicates} were already in your list.`
              : undefined,
        });
      }
      load();
    } catch {
      toast.error("Could not reach the AI.");
    } finally {
      setGenBusy(false);
    }
  };

  const changeShuffle = async (enabled: boolean) => {
    setShuffleBusy(true);
    try {
      const r = await apiFetch("/api/shuffle", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error();
      const next = (await r.json()) as ShuffleState;
      setShuffle(next);
      toast.success(
        enabled
          ? shuffle?.enabled
            ? "Re-shuffled for both of you."
            : "Shuffle on for both of you."
          : "Back to alphabetical order."
      );
    } catch {
      toast.error("Could not change order.");
    } finally {
      setShuffleBusy(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      const r = await apiFetch("/api/swipes/reset", { method: "POST" });
      if (!r.ok) throw new Error();
      toast.success("Your swipes have been reset.");
      setConfirm(false);
      load();
    } catch {
      toast.error("Could not reset.");
    } finally {
      setResetting(false);
    }
  };

  const switchUser = () => {
    setUser(null);
    router.replace("/");
  };

  if (!user) return null;

  const emoji = user === "karo" ? "🧔🏻" : "👩🏼";
  const gradient =
    user === "karo"
      ? "from-amber-200 via-amber-100 to-rose-100"
      : "from-rose-200 via-rose-100 to-amber-100";

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-6 min-h-0 overflow-y-auto">
      <h1 className="font-serif text-3xl text-stone-800">Settings</h1>
      <p className="text-xs text-stone-500 mt-1">Switch user, see stats, reset.</p>

      <section className="mt-6 rounded-3xl border border-stone-200/70 bg-white/70 p-5 flex items-center gap-4">
        <div
          className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl`}
        >
          {emoji}
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-stone-500">Swiping as</div>
          <div className="font-serif text-2xl text-stone-900">{displayName(user)}</div>
        </div>
        <Button variant="outline" onClick={switchUser} className="rounded-full">
          <LogOut size={14} />
          Switch
        </Button>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Names total" value={stats?.totalNames} />
        <Stat label="Swiped by you" value={stats?.swipedByMe} />
        <Stat label="Liked by you" value={stats?.likedByMe} />
        <Stat label="Matches" value={stats?.totalMatches} accent />
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200/70 bg-white/70 p-5">
        <div className="flex items-center gap-2 text-stone-800 font-medium">
          <span className="font-serif text-base">Surname preview</span>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Shown under each name on the card. Leave blank to hide.
        </p>
        <input
          type="text"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          placeholder="e.g. Bonas"
          maxLength={40}
          className="mt-3 w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 min-h-[44px] text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <p className="mt-2 text-xs text-stone-500">
          Saved to this browser only.
        </p>
      </section>

      <section className="mt-5 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50/70 p-5">
        <div className="flex items-center gap-2 text-stone-800 font-medium">
          <Sparkles size={16} className="text-amber-600" />
          Add names with AI
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Generate 30 new names. Optionally tell it the vibe.
        </p>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          disabled={genBusy}
          placeholder="e.g. rare Welsh, Old English, modern unisex"
          maxLength={120}
          className="mt-3 w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 min-h-[44px] text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <Button
          onClick={generate}
          disabled={genBusy}
          className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Sparkles size={14} className={genBusy ? "animate-pulse" : ""} />
          {genBusy ? "Generating…" : "Generate 30 names"}
        </Button>
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200/70 bg-white/70 p-5">
        <div className="flex items-center gap-2 text-stone-800 font-medium">
          {shuffle?.enabled ? <Shuffle size={16} /> : <ListOrdered size={16} />}
          Order
        </div>
        <p className="mt-2 text-sm text-stone-600">
          {shuffle?.enabled
            ? "Shuffled. You and your partner see the same random order."
            : "Alphabetical. You and your partner see the same A to Z order."}
        </p>
        {shuffle?.enabled && shuffle?.updatedAt && (
          <p className="mt-1 text-xs text-stone-500">
            Last shuffled {timeAgo(shuffle.updatedAt)}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {shuffle?.enabled ? (
            <>
              <Button
                variant="outline"
                onClick={() => changeShuffle(true)}
                disabled={shuffleBusy}
                className="flex-1"
              >
                <Shuffle size={14} />
                Re-shuffle
              </Button>
              <Button
                variant="outline"
                onClick={() => changeShuffle(false)}
                disabled={shuffleBusy}
                className="flex-1"
              >
                <ListOrdered size={14} />
                Use A to Z
              </Button>
            </>
          ) : (
            <Button
              onClick={() => changeShuffle(true)}
              disabled={shuffleBusy}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Shuffle size={14} />
              Shuffle names
            </Button>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-rose-200 bg-rose-50/70 p-5">
        <div className="flex items-center gap-2 text-rose-700 font-medium">
          <RefreshCw size={16} />
          Danger zone
        </div>
        <p className="mt-2 text-sm text-stone-600">
          Reset your swipes only. Your partner is unaffected.
        </p>
        <Button
          variant="destructive"
          onClick={() => setConfirm(true)}
          className="mt-3 w-full"
        >
          <Trash2 size={14} />
          Reset my swipes
        </Button>
      </section>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="bg-amber-50">
          <DialogHeader>
            <DialogTitle>Reset your swipes?</DialogTitle>
            <DialogDescription>
              This removes every swipe you have made. Your partner keeps theirs. You can swipe through all names again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={resetting} onClick={reset}>
              {resetting ? "Resetting…" : "Yes, reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | undefined;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? "border-rose-200 bg-rose-50/80" : "border-stone-200 bg-white/70"
      }`}
    >
      <div className="text-xs uppercase tracking-widest text-stone-500">{label}</div>
      <div
        className={`mt-1 font-serif text-3xl ${accent ? "text-rose-600" : "text-stone-900"}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
