"use client";

import { useMemo, useState } from "react";
import type { LedgerEntry, WordStatus } from "../lib/wordLedger";

export default function WordReviewTable({ initialEntries }: { initialEntries: LedgerEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const visible = useMemo(
    () => entries.filter((entry) => entry.word.toLowerCase().includes(query.toLowerCase())),
    [entries, query]
  );

  async function save(entry: LedgerEntry) {
    setMessage(`Saving ${entry.word}…`);
    const response = await fetch("/api/admin/words", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    setMessage(response.ok ? `Saved ${entry.word}.` : `Could not save ${entry.word}.`);
  }

  function update(id: string, patch: Partial<LedgerEntry>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter words"
          style={{ padding: 8, flex: 1 }}
        />
        <span aria-live="polite">{message}</span>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {visible.map((entry) => (
          <details key={entry.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12 }}>
            <summary style={{ cursor: "pointer" }}>
              <strong>{entry.word}</strong> · {entry.partOfSpeech} · difficulty {entry.difficulty} · {entry.status}
            </summary>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <label>Definition<input value={entry.definition} onChange={(e) => update(entry.id, { definition: e.target.value })} style={{ width: "100%" }} /></label>
              <label>Synonym<input value={entry.synonym} onChange={(e) => update(entry.id, { synonym: e.target.value })} style={{ width: "100%" }} /></label>
              <label>Example<input value={entry.exampleSentence} onChange={(e) => update(entry.id, { exampleSentence: e.target.value })} style={{ width: "100%" }} /></label>
              {entry.distractors?.map((value, index) => (
                <label key={index}>Distractor {index + 1}<input value={value} onChange={(e) => {
                  const distractors = [...(entry.distractors ?? [])];
                  distractors[index] = e.target.value;
                  update(entry.id, { distractors });
                }} style={{ width: "100%" }} /></label>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                {(["approved", "rejected", "retired"] as WordStatus[]).map((status) => (
                  <button key={status} type="button" onClick={() => update(entry.id, { status })}>{status}</button>
                ))}
                <button type="button" onClick={() => save(entries.find((item) => item.id === entry.id) ?? entry)}>Save</button>
              </div>
              <small>{entry.sourceAttribution} · prompt v{entry.promptVersion} · review v{entry.reviewVersion}</small>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
