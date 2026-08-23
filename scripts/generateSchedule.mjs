import fs from "fs/promises";
import path from "path";

const DAYS = Number(process.env.SCHEDULE_DAYS || 90);
const RECENT_WINDOW = 10;

function nyDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function validateEntry(entry) {
  if (!entry.id || entry.status !== "approved") throw new Error(`Invalid entry: ${entry.word}`);
  if (!Array.isArray(entry.distractors) || entry.distractors.length !== 3) {
    throw new Error(`Missing distractors: ${entry.word}`);
  }
  if (!entry.sourceAttribution) throw new Error(`Missing attribution: ${entry.word}`);
}

const ledgerPath = path.resolve("content/word-ledger.json");
const schedulePath = path.resolve("content/daily-puzzles.json");
const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
const approved = ledger.entries.filter((entry) => entry.status === "approved");
approved.forEach(validateEntry);

let schedule = { schemaVersion: 1, generatedAt: "", puzzles: {} };
try {
  schedule = JSON.parse(await fs.readFile(schedulePath, "utf8"));
} catch {}
if (process.argv.includes("--rebuild")) {
  schedule = { schemaVersion: 1, generatedAt: "", puzzles: {} };
}

const start = nyDateKey();
const usage = new Map(approved.map((entry) => [entry.id, 0]));
for (const puzzle of Object.values(schedule.puzzles)) {
  for (const id of puzzle.wordIds) usage.set(id, (usage.get(id) ?? 0) + 1);
}

for (let day = 0; day < DAYS; day += 1) {
  const dateKey = addDays(start, day);
  if (schedule.puzzles[dateKey]) continue;

  const recentIds = new Set();
  for (let offset = 1; offset <= RECENT_WINDOW; offset += 1) {
    const prior = schedule.puzzles[addDays(dateKey, -offset)];
    prior?.wordIds.forEach((id) => recentIds.add(id));
  }

  const rank = (entries) => entries.sort((a, b) => {
    const score = (entry) =>
      (usage.get(entry.id) ?? 0) * 100 +
      Math.abs((entry.difficulty ?? 3) - 3) * 2 +
      (hash(`${dateKey}:${entry.id}`) % 1000) / 1000;
    return score(a) - score(b);
  });
  const available = approved.filter((entry) => !recentIds.has(entry.id));
  const nonAdjectives = rank(available.filter((entry) => entry.partOfSpeech !== "adjective"));
  const adjectives = rank(available.filter((entry) => entry.partOfSpeech === "adjective"));
  if (nonAdjectives.length < 1 || adjectives.length < 4) {
    throw new Error(`Not enough fresh, balanced words for ${dateKey}`);
  }
  const selected = [nonAdjectives[0], ...adjectives.slice(0, 4)];

  schedule.puzzles[dateKey] = {
    wordIds: selected.map((entry) => entry.id),
    contentVersion: ledger.schemaVersion,
  };
  selected.forEach((entry) => usage.set(entry.id, (usage.get(entry.id) ?? 0) + 1));
}

schedule.generatedAt = new Date().toISOString();
ledger.updatedAt = new Date().toISOString();
ledger.entries = ledger.entries.map((entry) => ({ ...entry, timesUsed: usage.get(entry.id) ?? 0 }));

await Promise.all([
  fs.writeFile(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8"),
  fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8"),
]);

console.log(`Frozen ${Object.keys(schedule.puzzles).length} puzzles through ${addDays(start, DAYS - 1)}.`);
