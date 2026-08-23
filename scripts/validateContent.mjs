import fs from "fs/promises";
import path from "path";

const ledger = JSON.parse(await fs.readFile(path.resolve("content/word-ledger.json"), "utf8"));
const schedule = JSON.parse(await fs.readFile(path.resolve("content/daily-puzzles.json"), "utf8"));
const errors = [];
const byId = new Map();

for (const entry of ledger.entries) {
  if (byId.has(entry.id)) errors.push(`Duplicate ledger id: ${entry.id}`);
  byId.set(entry.id, entry);
  if (entry.status === "approved") {
    if (entry.distractors?.length !== 3) errors.push(`${entry.word}: needs 3 distractors`);
    if (!entry.sourceAttribution) errors.push(`${entry.word}: missing attribution`);
    const choices = [entry.definition, ...(entry.distractors ?? [])].map((value) => value.toLowerCase());
    if (new Set(choices).size !== choices.length) errors.push(`${entry.word}: duplicate choice`);
    const lengths = choices.map((choice) => choice.length);
    if (Math.max(...lengths) / Math.max(1, Math.min(...lengths)) > 4) {
      errors.push(`${entry.word}: answer lengths are too revealing`);
    }
  }
}

const dates = Object.keys(schedule.puzzles).sort();
for (let index = 0; index < dates.length; index += 1) {
  const date = dates[index];
  const ids = schedule.puzzles[date].wordIds;
  if (ids.length !== 5 || new Set(ids).size !== 5) errors.push(`${date}: expected 5 unique words`);
  const entries = ids.map((id) => byId.get(id));
  if (entries.some((entry) => !entry || entry.status !== "approved")) {
    errors.push(`${date}: contains unknown or unapproved word`);
    continue;
  }
  const posCounts = entries.reduce((counts, entry) => {
    counts[entry.partOfSpeech] = (counts[entry.partOfSpeech] ?? 0) + 1;
    return counts;
  }, {});
  if (Math.max(...Object.values(posCounts)) > 4) errors.push(`${date}: insufficient POS variety`);

  const recent = new Set(
    dates.slice(Math.max(0, index - 10), index).flatMap((prior) => schedule.puzzles[prior].wordIds)
  );
  for (const id of ids) if (recent.has(id)) errors.push(`${date}: repeats ${id} within 10 days`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${ledger.entries.length} ledger entries and ${dates.length} frozen puzzles.`);
