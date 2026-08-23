import { unstable_cache } from "next/cache";
import type { DailyGame, RoundData, WordEntry } from "./types";
import { seededShuffle, selectDailyEntries } from "./dailySelection";
import { getApprovedWords } from "./wordLedger";
import scheduleData from "../content/daily-puzzles.json";

type BankWord = WordEntry;

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

function formatDefinitionChoice(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toLocaleLowerCase()}${trimmed.slice(1)}` : trimmed;
}

function contentHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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

  const bank = cleanBank(getApprovedWords());

  if (bank.length < 8) {
    throw new Error(`Word bank too small: ${bank.length}`);
  }

  const scheduledIds = (scheduleData.puzzles as Record<string, { wordIds: string[] }>)[dateKey]?.wordIds;
  const scheduled = scheduledIds
    ?.map((id) => bank.find((entry) => entry.id === id))
    .filter((entry): entry is BankWord => Boolean(entry));
  // Dates outside the frozen window retain a deterministic fallback.
  const selected = scheduled?.length === 5 ? scheduled : selectDailyEntries(bank, dateKey, 5);

  const rounds: RoundData[] = selected.map((entry, idx) => {
    const tailoredDistractors = entry.distractors?.filter(
      (definition) => definition !== entry.definition
    );
    const wrongChoices = tailoredDistractors?.length === 3
      ? tailoredDistractors
      : getDistractorDefinitions(entry, bank, `${dateKey}:${entry.word}:${idx}`);

    const correctDefinition = formatDefinitionChoice(entry.definition);
    const choices = seededShuffle(
      [correctDefinition, ...wrongChoices.map(formatDefinitionChoice)],
      `${dateKey}:${entry.word}:choices:${idx}`
    );

    return {
      word: entry.word,
      choices,
      correctIndex: choices.findIndex((choice) => choice === correctDefinition),
      partOfSpeech: entry.partOfSpeech,
      synonym: entry.synonym,
      exampleSentence: entry.exampleSentence,
      sourceAttribution: entry.sourceAttribution,
    };
  });

  return {
    dateKey,
    contentKey: `${dateKey}:${contentHash(JSON.stringify(rounds.map(({ word, choices, correctIndex }) => ({ word, choices, correctIndex }))))}`,
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
