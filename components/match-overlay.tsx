"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import Link from "next/link";
import { Confetti } from "@/components/confetti";

function playChime() {
  try {
    type AC = typeof AudioContext;
    const win = window as unknown as Window & { webkitAudioContext?: AC };
    const Ctx: AC | undefined = window.AudioContext ?? win.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes: { f: number; t: number }[] = [
      { f: 587.33, t: 0 },
      { f: 880.0, t: 0.18 },
    ];
    for (const n of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(n.f, now + n.t);
      g.gain.setValueAtTime(0, now + n.t);
      g.gain.linearRampToValueAtTime(0.18, now + n.t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.5);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + n.t);
      o.stop(now + n.t + 0.55);
    }
  } catch {}
}

type Props = {
  name: { id: number; name: string } | null;
  surname?: string;
  onDismiss: () => void;
};

export function MatchOverlay({ name, surname, onDismiss }: Props) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!name) return;
    playChime();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([20, 60, 30]);
      } catch {}
    }
    const id = window.setTimeout(() => dismissRef.current(), 4000);
    return () => window.clearTimeout(id);
  }, [name]);

  return (
    <AnimatePresence>
      {name && (
        <motion.div
          key="match"
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-stone-900/55 backdrop-blur-md"
            onClick={onDismiss}
            aria-hidden
          />
          <motion.div
            className="relative w-full max-w-sm text-center"
            initial={{ scale: 0.92, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
          >
            <div className="relative mx-auto h-28 w-28">
              <Confetti />
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.15, 1] }}
                transition={{ duration: 0.6, times: [0, 0.7, 1] }}
              >
                <div className="rounded-full bg-gradient-to-br from-rose-400 to-rose-600 p-6 shadow-xl shadow-rose-500/30">
                  <Heart className="text-white fill-white" size={44} />
                </div>
              </motion.div>
            </div>
            <p className="mt-6 text-rose-100 text-sm font-medium tracking-wide uppercase">It is a match</p>
            <h2 className="mt-2 font-serif text-6xl text-white drop-shadow-sm">{name.name}</h2>
            {surname ? (
              <p className="mt-1 font-serif text-2xl text-white/80">{surname}</p>
            ) : null}
            <p className="mt-3 text-stone-200">Karo and Lucy both like this one.</p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={onDismiss}
                className="w-full rounded-2xl bg-white text-stone-900 font-medium py-3.5 min-h-[44px] shadow-lg active:scale-[0.98] transition"
              >
                Keep swiping
              </button>
              <Link
                href="/matches"
                onClick={onDismiss}
                className="w-full rounded-2xl border border-white/40 text-white font-medium py-3.5 min-h-[44px] hover:bg-white/10 transition text-center"
              >
                View matches
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
