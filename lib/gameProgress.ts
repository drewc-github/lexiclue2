import type { DailyGame, HintType } from "./types";

export type RoundProgress = {
  selectedIndex: number | null;
  isCorrect: boolean | null;
  used: Record<HintType, boolean>;
};

export type SavedGameProgress = {
  current: number;
  showResults: boolean;
  progress: RoundProgress[];
};

export function createInitialProgress(daily: DailyGame): RoundProgress[] {
  return daily.rounds.map(() => ({
    selectedIndex: null,
    isCorrect: null,
    used: { pos: false, synonym: false, sentence: false },
  }));
}

export function restoreGameProgress(
  raw: string | null,
  daily: DailyGame
): SavedGameProgress {
  const fallback = {
    current: 0,
    showResults: false,
    progress: createInitialProgress(daily),
  };

  if (!raw) return fallback;

  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(saved.progress) || saved.progress.length !== daily.rounds.length) {
      return fallback;
    }

    const progress = saved.progress.map((value, roundIndex) => {
      const entry = value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
      const round = daily.rounds[roundIndex];
      const candidate = entry.selectedIndex;
      const selectedIndex =
        Number.isInteger(candidate) &&
        (candidate as number) >= 0 &&
        (candidate as number) < round.choices.length
          ? (candidate as number)
          : null;
      const used = entry.used && typeof entry.used === "object"
        ? (entry.used as Record<string, unknown>)
        : {};

      return {
        selectedIndex,
        isCorrect:
          selectedIndex === null ? null : selectedIndex === round.correctIndex,
        used: {
          pos: used.pos === true,
          synonym: used.synonym === true,
          sentence: used.sentence === true,
        },
      } satisfies RoundProgress;
    });

    const maxRoundIndex = Math.max(0, daily.rounds.length - 1);
    const current =
      Number.isInteger(saved.current) &&
      (saved.current as number) >= 0 &&
      (saved.current as number) <= maxRoundIndex
        ? (saved.current as number)
        : 0;

    return {
      current,
      showResults: saved.showResults === true,
      progress,
    };
  } catch {
    return fallback;
  }
}
