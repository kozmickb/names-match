/**
 * Standard tournament seeding order for a bracket of size n (power of two).
 * Returns seed numbers (1 = top seed) in bracket position order, so that
 * consecutive pairs are the round-1 ties (e.g. n=4 -> [1,4,2,3] => 1v4, 2v3)
 * and the top seeds can only meet in later rounds.
 */
export function seedOrder(n: number): number[] {
  let order = [1, 2];
  while (order.length < n) {
    const len = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(len + 1 - s);
    }
    order = next;
  }
  return order;
}

/** Largest power of two <= count, capped at 8 (the qualifying field size). */
export function bracketSize(count: number): number {
  if (count >= 8) return 8;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  return 0;
}

/** Number of rounds for a bracket of the given size (4 -> 2, 8 -> 3). */
export function roundsCount(size: number): number {
  return Math.round(Math.log2(size));
}

/** Human label for a round given the bracket size (final, semis, quarters...). */
export function roundLabel(round: number, size: number): string {
  const total = roundsCount(size);
  const fromFinal = total - round; // 0 = final
  if (fromFinal === 0) return "Final";
  if (fromFinal === 1) return "Semi-finals";
  if (fromFinal === 2) return "Quarter-finals";
  return `Round ${round}`;
}
