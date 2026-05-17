const FLAGGED = new Set([
  "ASS",
  "BUM",
  "FAG",
  "FAT",
  "GAY",
  "JAP",
  "KKK",
  "NAZ",
  "PIG",
  "POO",
  "SEX",
  "TIT",
  "WAP",
  "WTF",
]);

export function computeInitials(first: string, surname: string): string {
  const f = first.trim().charAt(0).toUpperCase();
  const s = surname.trim().charAt(0).toUpperCase();
  return [f, s].filter(Boolean).join(".");
}

export function flagInitials(first: string, surname: string): { initials: string; flagged: boolean } {
  const f = first.trim().charAt(0).toUpperCase();
  const s = surname.trim().charAt(0).toUpperCase();
  const combined = `${f}${s}`;
  return {
    initials: [f, s].filter(Boolean).join("."),
    flagged: FLAGGED.has(combined),
  };
}
