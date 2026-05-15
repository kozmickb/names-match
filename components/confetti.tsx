"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

const palette = ["#f43f5e", "#f59e0b", "#fbbf24", "#fb7185", "#10b981", "#a855f7", "#3b82f6", "#f97316"];

export function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const distance = 140 + Math.random() * 120;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          rotate: Math.random() * 540 - 270,
          color: palette[i % palette.length],
          size: 6 + Math.random() * 8,
          delay: Math.random() * 0.1,
        };
      }),
    [count]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 block rounded-sm"
          style={{ backgroundColor: p.color, width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 1.1, ease: "easeOut", delay: p.delay }}
        />
      ))}
    </div>
  );
}
