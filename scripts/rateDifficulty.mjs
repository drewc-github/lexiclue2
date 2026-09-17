import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const ledgerPath = path.resolve("content/word-ledger.json");
const CHUNK_SIZE = 30;

if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

async function rateChunk(entries) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ratings: {
        type: "array",
        minItems: entries.length,
        maxItems: entries.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            difficulty: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["id", "difficulty"],
        },
      },
    },
    required: ["ratings"],
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
          content: "Rate vocabulary difficulty for a general adult English-speaking player. Use the word and the specific definition supplied. Use the full scale consistently: 1=very familiar everyday word, 2=familiar but mildly challenging, 3=intermediate, 4=advanced, 5=rare or expert-level. Judge likely familiarity and sense, not spelling length. Return every supplied id exactly once.",
        },
        {
          role: "user",
          content: JSON.stringify(entries.map(({ id, word, definition, partOfSpeech }) => ({ id, word, definition, partOfSpeech }))),
        },
      ],
      text: { format: { type: "json_schema", name: "difficulty_ratings", strict: true, schema } },
    }),
  });

  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const body = await response.json();
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no difficulty ratings");
  return JSON.parse(text).ratings;
}

const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8"));
const playable = ledger.entries.filter((entry) => entry.status === "approved");
const ratings = [];

for (let index = 0; index < playable.length; index += CHUNK_SIZE) {
  const chunk = playable.slice(index, index + CHUNK_SIZE);
  console.log(`Rating ${index + 1}-${index + chunk.length} of ${playable.length}...`);
  ratings.push(...await rateChunk(chunk));
}

const byId = new Map(ratings.map((rating) => [rating.id, rating.difficulty]));
if (byId.size !== playable.length || playable.some((entry) => !byId.has(entry.id))) {
  throw new Error("Difficulty response did not contain every approved word; ledger was not changed");
}

ledger.entries = ledger.entries.map((entry) =>
  byId.has(entry.id)
    ? { ...entry, difficulty: byId.get(entry.id), difficultyModel: MODEL }
    : entry
);
ledger.updatedAt = new Date().toISOString();
await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`Updated difficulty for ${playable.length} words.`);
