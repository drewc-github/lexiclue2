import type { WordEntry } from "./types";

export function normalizedDifficulty(entry: WordEntry): number {
  const value = Number(entry.difficulty);
  return Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 3;
}

export function orderEntriesByDifficulty<T extends WordEntry>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        normalizedDifficulty(a.entry) - normalizedDifficulty(b.entry) ||
        a.index - b.index
    )
    .map(({ entry }) => entry);
}
