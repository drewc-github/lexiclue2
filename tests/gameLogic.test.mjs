import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { restoreGameProgress } from "../lib/gameProgress.ts";
import { selectDailyEntries } from "../lib/dailySelection.ts";
const ledger = JSON.parse(fs.readFileSync(new URL("../content/word-ledger.json", import.meta.url), "utf8"));

const daily = {
  dateKey: "2026-08-23",
  contentKey: "2026-08-23:test-puzzle",
  rounds: Array.from({ length: 5 }, (_, index) => ({
    word: `word${index}`,
    choices: ["a", "b", "c", "d"],
    correctIndex: index % 4,
  })),
};

test("malformed progress falls back safely", () => {
  const restored = restoreGameProgress("not json", daily);
  assert.equal(restored.current, 0);
  assert.equal(restored.showResults, false);
  assert.equal(restored.progress.length, 5);
  assert.ok(restored.progress.every((round) => round.selectedIndex === null));
});

test("restored indexes are range checked and correctness is recomputed", () => {
  const raw = JSON.stringify({
    current: 99,
    showResults: true,
    progress: daily.rounds.map((_, index) => ({
      selectedIndex: index === 0 ? 99 : index % 4,
      isCorrect: false,
      used: { pos: 1, synonym: true, sentence: false },
    })),
  });
  const restored = restoreGameProgress(raw, daily);

  assert.equal(restored.current, 0);
  assert.equal(restored.progress[0].selectedIndex, null);
  assert.equal(restored.progress[1].isCorrect, true);
  assert.equal(restored.progress[1].used.pos, false);
  assert.equal(restored.progress[1].used.synonym, true);
});

test("a tentative answer on the current question is not restored", () => {
  const raw = JSON.stringify({
    current: 2,
    showResults: false,
    progress: daily.rounds.map((_, index) => ({
      selectedIndex: index % 4,
      isCorrect: true,
      used: { pos: false, synonym: false, sentence: false },
    })),
  });
  const restored = restoreGameProgress(raw, daily);

  assert.equal(restored.progress[1].selectedIndex, 1);
  assert.equal(restored.progress[2].selectedIndex, null);
  assert.equal(restored.progress[3].selectedIndex, null);
});

test("daily selection is deterministic and non-overlapping within a cycle", () => {
  const bank = Array.from({ length: 20 }, (_, index) => index);
  const dayMs = 24 * 60 * 60 * 1000;
  const cycleStart = Math.floor(Date.now() / dayMs / 4) * 4;
  const keys = [0, 1, 2, 3].map((offset) =>
    new Date((cycleStart + offset) * dayMs).toISOString().slice(0, 10)
  );
  const selections = keys.map((key) => selectDailyEntries(bank, key));

  assert.deepEqual(selectDailyEntries(bank, keys[0]), selections[0]);
  assert.equal(new Set(selections.flat()).size, 20);
});

test("every playable word has a coherent, complete content bundle", () => {
  for (const entry of ledger.entries.filter((item) => item.status === "approved")) {
    assert.ok(["noun", "verb", "adjective", "adverb"].includes(entry.partOfSpeech), entry.word);
    assert.ok(entry.definition.length >= 16, entry.word);
    assert.ok(entry.synonym && entry.synonym.toLowerCase() !== entry.word.toLowerCase(), entry.word);
    assert.ok(
      entry.exampleSentence.toLowerCase().includes(entry.word.toLowerCase().slice(0, 5)),
      entry.word
    );
    assert.equal(entry.distractors.length, 3, entry.word);
    assert.equal(new Set(entry.distractors.map((value) => value.toLowerCase())).size, 3, entry.word);
    assert.ok(!entry.distractors.some((value) => value.toLowerCase() === entry.definition.toLowerCase()), entry.word);
    assert.ok(entry.sourceDictionary, entry.word);
    assert.ok(entry.sourceAttribution, entry.word);
  }
});
