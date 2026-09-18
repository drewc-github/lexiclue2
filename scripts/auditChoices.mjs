import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const ledgerPath = path.resolve("content/word-ledger.json");
const CHUNK_SIZE = 20;
const CHOICE_REVIEW_VERSION = 2;

if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

async function auditChunk(entries) {
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
            distractors: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
            issues: { type: "array", items: { type: "string" } },
          },
          required: ["id", "accept", "distractors", "issues"],
        },
      },
    },
    required: ["reviews"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      input: [
        {
          role: "developer",
          content: "Audit multiple-choice vocabulary entries. The supplied definition is correct. Accept only when all three distractors are plausible definitions with the same grammatical form, but describe clearly different word concepts from the correct answer and from one another. Reject semantic neighbors, partial matches, antonyms, negations, degree changes, and minimal wording substitutions. Also reject repetitive presentation: the four choices must not reuse the same opening phrase, parallel fill-in template, or near-identical syntax. Distractors should have varied natural sentence structures while preserving part-of-speech plausibility and broadly similar lengths, so grammar or length does not reveal the answer. If rejecting, replace all three distractors with lowercase, period-free definitions satisfying every rule. If accepting, repeat the existing distractors unchanged. Return every supplied id exactly once.",
        },
        {
          role: "user",
          content: JSON.stringify(entries.map(({ id, word, definition, partOfSpeech, distractors }) => ({ id, word, definition, partOfSpeech, distractors }))),
        },
      ],
      text: { format: { type: "json_schema", name: "choice_set_audit", strict: true, schema } },
    }),
  });

  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = body.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no choice reviews");
  return JSON.parse(text).reviews;
}

function formatChoice(value) {
  const trimmed = String(value).trim().replace(/\.+$/, "").trimEnd();
  return trimmed ? `${trimmed[0].toLocaleLowerCase()}${trimmed.slice(1)}` : trimmed;
}

const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
const approved = ledger.entries.filter((entry) => entry.status === "approved");
const reviews = [];

for (let index = 0; index < approved.length; index += CHUNK_SIZE) {
  const chunk = approved.slice(index, index + CHUNK_SIZE);
  console.log(`Auditing ${index + 1}-${index + chunk.length} of ${approved.length}...`);
  reviews.push(...await auditChunk(chunk));
}

const byId = new Map(reviews.map((review) => [review.id, review]));
if (byId.size !== approved.length || approved.some((entry) => !byId.has(entry.id))) {
  throw new Error("Choice audit did not contain every approved word; ledger was not changed");
}

let repaired = 0;
ledger.entries = ledger.entries.map((entry) => {
  const review = byId.get(entry.id);
  if (!review) return entry;
  if (review.accept) return { ...entry, choiceReviewVersion: CHOICE_REVIEW_VERSION };
  const distractors = review.distractors.map(formatChoice);
  if (distractors.some((choice) => !choice) || new Set(distractors).size !== 3) {
    throw new Error(`Invalid replacement distractors for ${entry.word}; ledger was not changed`);
  }
  repaired += 1;
  console.log(`  repaired ${entry.word}: ${review.issues.join("; ")}`);
  return { ...entry, distractors, choiceReviewVersion: CHOICE_REVIEW_VERSION, choiceReviewModel: MODEL };
});

ledger.updatedAt = new Date().toISOString();
await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`Audited ${approved.length} words and repaired ${repaired} choice sets.`);
