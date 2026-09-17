import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const ledgerPath = path.resolve("content/word-ledger.json");
const CHUNK_SIZE = 30;
const SYNONYM_VERSION = 2;

if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z]/g, "");
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[right.length];
}

function revealsAnswer(word, synonym) {
  const answer = normalize(word);
  const clue = normalize(synonym);
  return answer === clue || (Math.min(answer.length, clue.length) >= 6 && editDistance(answer, clue) <= 2);
}

async function rewriteChunk(entries) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      synonyms: {
        type: "array",
        minItems: entries.length,
        maxItems: entries.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            synonym: { type: "string" },
          },
          required: ["id", "synonym"],
        },
      },
    },
    required: ["synonyms"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      input: [
        {
          role: "developer",
          content: "Rewrite synonym hints for a vocabulary game. Each hint must be an exact synonym for the supplied definition and match the answer's part of speech, but it should be meaningfully less obvious than a basic everyday translation. Prefer a sophisticated or secondary same-sense equivalent that rewards vocabulary knowledge without becoming inaccurate or archaic. Keep it concise (normally one word, at most three), never use the answer itself or a word sharing its lexical root, and do not return a definition, antonym, association, or example. Return every supplied id exactly once.",
        },
        {
          role: "user",
          content: JSON.stringify(entries.map(({ id, word, definition, partOfSpeech, synonym }) => ({ id, word, definition, partOfSpeech, currentSynonym: synonym }))),
        },
      ],
      text: { format: { type: "json_schema", name: "challenging_synonyms", strict: true, schema } },
    }),
  });

  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no synonyms");
  return JSON.parse(text).synonyms;
}

async function reviewChunk(entries, proposals) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      reviews: {
        type: "array",
        minItems: entries.length,
        maxItems: entries.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            accept: { type: "boolean" },
            replacement: { type: "string" },
          },
          required: ["id", "accept", "replacement"],
        },
      },
    },
    required: ["reviews"],
  };
  const proposedById = new Map(proposals.map((item) => [item.id, item.synonym]));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      input: [
        {
          role: "developer",
          content: "Audit proposed challenging synonym hints for a vocabulary game. Accept a proposal when it is a valid same-sense equivalent for the supplied definition, matches the answer's part of speech, and is usable contemporary English—even if it is uncommon or substantially harder than the answer. Do not replace a valid proposal just because a simpler or more familiar synonym exists; difficulty is intentional. Reject only loose associations, neighboring concepts, context-only alternatives, antonyms, archaic or unusably technical terms, wrong parts of speech, awkward phrases, and words sharing the answer's lexical root. For a rejection, supply a challenging but exact replacement. For an acceptance, repeat the proposal as replacement. Prefer one word and allow at most three. Return every supplied id exactly once.",
        },
        {
          role: "user",
          content: JSON.stringify(entries.map(({ id, word, definition, partOfSpeech }) => ({
            id,
            word,
            definition,
            partOfSpeech,
            proposedSynonym: proposedById.get(id),
          }))),
        },
      ],
      text: { format: { type: "json_schema", name: "challenging_synonym_reviews", strict: true, schema } },
    }),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no reviewed synonyms");
  return JSON.parse(text).reviews.map((review) => ({
    id: review.id,
    synonym: review.replacement,
  }));
}

const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
const playable = ledger.entries.filter((entry) => entry.status === "approved");
const rewritten = [];

for (let index = 0; index < playable.length; index += CHUNK_SIZE) {
  const chunk = playable.slice(index, index + CHUNK_SIZE);
  console.log(`Rewriting ${index + 1}-${index + chunk.length} of ${playable.length}...`);
  const proposals = await rewriteChunk(chunk);
  console.log(`Reviewing ${index + 1}-${index + chunk.length} of ${playable.length}...`);
  rewritten.push(...await reviewChunk(chunk, proposals));
}

const byId = new Map(rewritten.map((item) => [item.id, String(item.synonym).trim()]));
if (byId.size !== playable.length || playable.some((entry) => !byId.has(entry.id))) {
  throw new Error("Synonym response did not contain every approved word; ledger was not changed");
}

for (const entry of playable) {
  const synonym = byId.get(entry.id);
  if (!synonym || synonym.split(/\s+/).length > 3 || revealsAnswer(entry.word, synonym)) {
    throw new Error(`Invalid synonym returned for ${entry.word}; ledger was not changed`);
  }
}

ledger.entries = ledger.entries.map((entry) =>
  byId.has(entry.id)
    ? {
        ...entry,
        synonym: byId.get(entry.id),
        synonymModel: MODEL,
        synonymVersion: SYNONYM_VERSION,
      }
    : entry
);
ledger.updatedAt = new Date().toISOString();
await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`Updated synonym clues for ${playable.length} words.`);
