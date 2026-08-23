import fs from "node:fs/promises";
import path from "node:path";

const ledgerPath = path.resolve("content/word-ledger.json");
const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));

function formatChoice(value) {
  const withoutTrailingPeriods = String(value).trim().replace(/\.+$/, "").trimEnd();
  return withoutTrailingPeriods
    ? `${withoutTrailingPeriods[0].toLocaleLowerCase()}${withoutTrailingPeriods.slice(1)}`
    : withoutTrailingPeriods;
}

let changed = 0;
for (const entry of ledger.entries) {
  const definition = formatChoice(entry.definition);
  if (definition !== entry.definition) changed += 1;
  entry.definition = definition;

  if (Array.isArray(entry.distractors)) {
    entry.distractors = entry.distractors.map((value) => {
      const formatted = formatChoice(value);
      if (formatted !== value) changed += 1;
      return formatted;
    });
  }
}

await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`Normalized ${changed} stored choices.`);
