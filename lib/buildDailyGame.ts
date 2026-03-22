import { unstable_cache } from "next/cache";
import type { DailyGame, RoundData } from "./types";
import { SEED_WORDS } from "./seedWords";
import { GENERATED_WORDS } from "./generatedWords";

type BankWord = (typeof SEED_WORDS)[number];

function getNYDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function hashString(str: string) {
  let h = 1779033703 ^ str.length;

  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const seed = hashString(seedStr)();
  const rand = mulberry32(seed);
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function uniqueByWord(entries: BankWord[]): BankWord[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = entry.word.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDefinitions(entries: BankWord[]): BankWord[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = entry.definition.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanBank(entries: BankWord[]): BankWord[] {
  return uniqueDefinitions(uniqueByWord(entries));
}

function getDistractorDefinitions(
  correctEntry: BankWord,
  bank: BankWord[],
  seedStr: string
): string[] {
  const samePOS = bank.filter(
    (entry) =>
      entry.word !== correctEntry.word &&
      entry.partOfSpeech === correctEntry.partOfSpeech &&
      entry.definition !== correctEntry.definition
  );

  const fallback = bank.filter(
    (entry) =>
      entry.word !== correctEntry.word &&
      entry.definition !== correctEntry.definition
  );

  const samePOSDefs = seededShuffle(samePOS, `${seedStr}:same-pos`).map(
    (entry) => entry.definition
  );

  const fallbackDefs = seededShuffle(fallback, `${seedStr}:fallback`).map(
    (entry) => entry.definition
  );

  const combined = [...samePOSDefs, ...fallbackDefs];
  const deduped: string[] = [];

  for (const def of combined) {
    if (!deduped.includes(def)) {
      deduped.push(def);
    }
    if (deduped.length === 3) break;
  }

  if (deduped.length < 3) {
    throw new Error(`Not enough distractors for word: ${correctEntry.word}`);
  }

  return deduped;
}

async function buildDailyGameForDate(dateKey: string): Promise<DailyGame> {

  const bank = cleanBank([...SEED_WORDS, ...GENERATED_WORDS]);

  if (bank.length < 8) {
    throw new Error(`Word bank too small: ${bank.length}`);
  }

  const selected = seededShuffle(bank, `${dateKey}:selected`).slice(0, 5);

  const rounds: RoundData[] = selected.map((entry, idx) => {
    const wrongChoices = getDistractorDefinitions(
      entry,
      bank,
      `${dateKey}:${entry.word}:${idx}`
    );

    const choices = seededShuffle(
      [entry.definition, ...wrongChoices],
      `${dateKey}:${entry.word}:choices:${idx}`
    );

    return {
      word: entry.word,
      choices,
      correctIndex: choices.findIndex((choice) => choice === entry.definition),
      partOfSpeech: entry.partOfSpeech,
      synonym: entry.synonym,
      exampleSentence: entry.exampleSentence,
    };
  });

  return {
    dateKey,
    rounds,
  };
}

const getCachedDailyGame = unstable_cache(
  async (dateKey: string) => buildDailyGameForDate(dateKey),
  ["lexiclue-daily-game"],
  { revalidate: 60 * 60 * 24 }
);

export async function getDailyGame(): Promise<DailyGame> {
  const dateKey = getNYDateKey();
  return getCachedDailyGame(dateKey);
}