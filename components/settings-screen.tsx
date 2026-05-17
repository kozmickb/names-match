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
import { RefreshCw, LogOut, Trash2, Shuffle, ListOrdered, Sparkles, Bell, BellOff } from "lucide-react";
import {
  currentSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";
import { timeAgo } from "@/lib/time";

type Stats = {
  totalNames: number;
  swipedByMe: number;
  likedByMe: number;
  totalMatches: number;
};

type ShuffleState = { enabled: boolean; seed: number; updatedAt: string | null };

const EMOJI_PICKS = [
  "🧔🏻", "🧔🏼", "🧔🏽", "🧔🏾", "🧔🏿",
  "👨🏻", "👨🏼", "👨🏽", "👨🏾", "👨🏿",
  "👩🏻", "👩🏼", "👩🏽", "👩🏾", "👩🏿",
  "🧑🏻", "🧑🏼", "🧑🏽", "🧑🏾", "🧑🏿",
  "🦄", "🐱", "🦊", "🐼", "🐻",
  "🦁", "🐶", "🐰", "🐧", "🐝",
  "🌟", "✨", "💫", "🌙", "☀️",
  "❤️", "💜", "💚", "🧡", "💙",
  "🍓", "🍒", "🍑", "🥭", "🍀",
];

export function SettingsScreen() {
  const { user, setUser, surname, setSurname, profiles, setOwnEmoji } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [shuffle, setShuffle] = useState<ShuffleState | null>(null);
  const [shuffleBusy, setShuffleBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [style, setStyle] = useState("");
  const [gender, setGender] = useState<"masculine" | "feminine" | "unisex">("masculine");
  const [genBusy, setGenBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [autoPass, setAutoPass] = useState(false);
  const [autoPassBusy, setAutoPassBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushAvailable] = useState<boolean>(() => pushSupported());
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiDraft, setEmojiDraft] = useState("");

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

  useEffect(() => {
    if (!pushAvailable) return;
    currentSubscription()
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => setPushEnabled(false));
  }, [pushAvailable]);

  useEffect(() => {
    apiFetch("/api/profile/auto-pass-variants")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { autoPassVariants: boolean } | null) => {
        if (j) setAutoPass(!!j.autoPassVariants);
      })
      .catch(() => {});
  }, []);

  const togglePush = async (next: boolean) => {
    setPushBusy(true);
    try {
      if (next) {
        const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapid) {
          toast.error("Push key not configured.");
          return;
        }
        const sub = await subscribeToPush(vapid);
        if (!sub) {
          toast.error("Notification permission denied.");
          return;
        }
        const payload = sub.toJSON();
        const r = await apiFetch("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error();
        setPushEnabled(true);
        toast.success("Notifications on. We will ping you for new matches.");
      } else {
        const sub = await currentSubscription();
        if (sub) {
          await apiFetch("/api/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await unsubscribeFromPush();
        }
        setPushEnabled(false);
        toast.message("Notifications off.");
      }
    } catch {
      toast.error("Could not change notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const suggest = async () => {
    setSuggestBusy(true);
    try {
      const r = await apiFetch("/api/names/suggest", {
        method: "POST",
        body: JSON.stringify({ count: 30, gender }),
      });
      const j = (await r.json()) as
        | { added: number; duplicates: number; generated: number; seedSampleSize: number }
        | { error: string };
      if (!r.ok || "error" in j) {
        toast.error("error" in j ? j.error : "Could not generate.");
        return;
      }
      if (j.added === 0) {
        toast.message("All suggestions were already in your list. Try Generate instead.");
      } else {
        toast.success(`Added ${j.added} new name${j.added === 1 ? "" : "s"} like yours`, {
          description:
            j.duplicates > 0
              ? `${j.duplicates} were already in your list.`
              : `Based on your ${j.seedSampleSize} most recent likes.`,
        });
      }
      load();
    } catch {
      toast.error("Could not reach the AI.");
    } finally {
      setSuggestBusy(false);
    }
  };

  const toggleAutoPass = async (next: boolean) => {
    setAutoPassBusy(true);
    setAutoPass(next);
    try {
      const r = await apiFetch("/api/profile/auto-pass-variants", {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) throw new Error();
      toast.success(
        next ? "Auto-pass variants on" : "Auto-pass variants off",
        { duration: 1500 }
      );
    } catch {
      setAutoPass(!next);
      toast.error("Could not save.");
    } finally {
      setAutoPassBusy(false);
    }
  };

  const generate = async () => {
    setGenBusy(true);
    try {
      const r = await apiFetch("/api/names/generate", {
        method: "POST",
        body: JSON.stringify({ count: 30, style: style || undefined, gender }),
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

  const emoji = profiles[user].emoji;
  const gradient =
    user === "karo"
      ? "from-amber-200 via-amber-100 to-rose-100"
      : "from-rose-200 via-rose-100 to-amber-100";

  const chooseEmoji = async (next: string) => {
    try {
      await setOwnEmoji(next);
      toast.success("Avatar updated");
      setEmojiOpen(false);
      setEmojiDraft("");
    } catch {
      toast.error("Could not save avatar.");
    }
  };

  return (
    <div className="flex-1 flex flex-col px-5 pt-6 pb-6 min-h-0 overflow-y-auto">
      <h1 className="font-serif text-3xl text-stone-800">Settings</h1>
      <p className="text-xs text-stone-500 mt-1">Switch user, see stats, reset.</p>

      <section className="mt-6 rounded-3xl border border-stone-200/70 bg-white/70 p-5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEmojiOpen(true)}
          aria-label="Change your avatar emoji"
          className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl active:scale-95 transition`}
        >
          <span>{emoji}</span>
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center shadow">
            ✎
          </span>
        </button>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-stone-500">Swiping as</div>
          <div className="font-serif text-2xl text-stone-900">{displayName(user)}</div>
          <div className="text-xs text-stone-500">Tap the tile to change your emoji</div>
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
          Generate 30 new names. Choose a flavour and an optional vibe.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["masculine", "unisex", "feminine"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              disabled={genBusy}
              className={`rounded-2xl border py-2.5 text-xs font-medium min-h-[44px] capitalize transition ${
                gender === g
                  ? "border-amber-500 bg-amber-100 text-amber-800"
                  : "border-stone-300 bg-white/80 text-stone-600"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          disabled={genBusy}
          placeholder="Vibe (optional): rare Welsh, Old English…"
          maxLength={120}
          className="mt-3 w-full rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 min-h-[44px] text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <Button
          onClick={generate}
          disabled={genBusy || suggestBusy}
          className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Sparkles size={14} className={genBusy ? "animate-pulse" : ""} />
          {genBusy ? "Generating…" : "Generate 30 names"}
        </Button>
        <Button
          onClick={suggest}
          disabled={suggestBusy || genBusy}
          variant="outline"
          className="mt-2 w-full border-amber-300 text-amber-800 bg-white/60"
        >
          <Sparkles size={14} className={suggestBusy ? "animate-pulse" : ""} />
          {suggestBusy ? "Reading your taste…" : "More like names you liked"}
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

        <div className="mt-4 pt-4 border-t border-stone-200/70 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-stone-800">Auto-pass spelling variants</div>
            <p className="text-xs text-stone-500 mt-0.5">
              Hide variants of names you have already swiped, e.g. Konrad after Conrad.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleAutoPass(!autoPass)}
            disabled={autoPassBusy}
            aria-pressed={autoPass}
            className={`relative h-6 w-11 rounded-full transition shrink-0 ${
              autoPass ? "bg-amber-500" : "bg-stone-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                autoPass ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200/70 bg-white/70 p-5">
        <div className="flex items-center gap-2 text-stone-800 font-medium">
          {pushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          Notifications
        </div>
        <p className="mt-2 text-sm text-stone-600">
          {pushAvailable
            ? pushEnabled === null
              ? "Loading…"
              : pushEnabled
              ? "On. We will ping you when you both match a name."
              : "Off. Turn on to be pinged when you both match."
            : "Your browser does not support push notifications. On iPhone, add this app to the home screen first."}
        </p>
        <Button
          onClick={() => togglePush(!pushEnabled)}
          disabled={!pushAvailable || pushBusy || pushEnabled === null}
          className={`mt-3 w-full ${
            pushEnabled
              ? "bg-stone-200 hover:bg-stone-300 text-stone-800"
              : "bg-rose-500 hover:bg-rose-600 text-white"
          }`}
        >
          {pushEnabled ? <BellOff size={14} /> : <Bell size={14} />}
          {pushBusy
            ? "Working…"
            : pushEnabled
            ? "Turn off match notifications"
            : "Turn on match notifications"}
        </Button>
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

      <Dialog open={emojiOpen} onOpenChange={setEmojiOpen}>
        <DialogContent className="bg-amber-50 max-w-md">
          <DialogHeader>
            <DialogTitle>Pick your emoji</DialogTitle>
            <DialogDescription>
              Visible to both of you on the picker and Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-8 gap-1.5 my-2 max-h-[280px] overflow-y-auto">
            {EMOJI_PICKS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => chooseEmoji(e)}
                className={`h-11 w-11 rounded-xl text-2xl flex items-center justify-center transition active:scale-90 ${
                  e === emoji ? "bg-amber-200 ring-2 ring-amber-500" : "hover:bg-stone-100"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <label className="text-xs text-stone-500 uppercase tracking-widest">
              Or paste any emoji
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={emojiDraft}
                onChange={(e) => setEmojiDraft(e.target.value)}
                placeholder="🎯"
                maxLength={16}
                className="flex-1 rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 min-h-[44px] text-2xl text-center outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
              <Button
                onClick={() => chooseEmoji(emojiDraft)}
                disabled={!emojiDraft.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Use
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmojiOpen(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
