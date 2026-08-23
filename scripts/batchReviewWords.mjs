import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config({ path: ".env.local" });
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const command = process.argv[2] || "prepare";
const value = process.argv[3];
const batchDir = path.resolve("work/lexiclues-batches");

if (!API_KEY && command !== "prepare") throw new Error("Missing OPENAI_API_KEY");

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accept: { type: "boolean" },
    definition: { type: "string" },
    synonym: { type: "string" },
    exampleSentence: { type: "string" },
    distractors: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["accept", "definition", "synonym", "exampleSentence", "distractors", "issues"],
};
const puzzleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accept: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["accept", "issues"],
};

function outputText(body) {
  return body.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text")?.text;
}

async function api(endpoint, options = {}) {
  const response = await fetch(`https://api.openai.com/v1${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}

await fs.mkdir(batchDir, { recursive: true });

if (command === "prepare" || command === "prepare-words") {
  const ledger = JSON.parse(await fs.readFile(path.resolve("content/word-ledger.json"), "utf8"));
  const targetVersion = Number(process.env.PROMPT_VERSION || 3);
  const entries = ledger.entries.filter(
    (entry) => entry.status !== "retired" && (entry.promptVersion ?? 0) < targetVersion
  );
  const lines = entries.map((entry) => JSON.stringify({
    custom_id: entry.id,
    method: "POST",
    url: "/v1/responses",
    body: {
      model: MODEL,
      store: false,
      input: [
        {
          role: "developer",
          content: "Review this vocabulary-game entry for exact sense agreement, learner-friendly wording, a precise synonym, a natural example, and three plausible but unambiguously wrong same-form distractors. Reject and explain any unresolved issue.",
        },
        { role: "user", content: JSON.stringify(entry) },
      ],
      text: { format: { type: "json_schema", name: "ledger_review", strict: true, schema } },
    },
  }));
  const filename = path.join(batchDir, `review-v${targetVersion}.jsonl`);
  await fs.writeFile(filename, `${lines.join("\n")}\n`, "utf8");
  console.log(`Prepared ${lines.length} requests at ${filename}`);
} else if (command === "prepare-puzzles") {
  const ledger = JSON.parse(await fs.readFile(path.resolve("content/word-ledger.json"), "utf8"));
  const schedule = JSON.parse(await fs.readFile(path.resolve("content/daily-puzzles.json"), "utf8"));
  const byId = new Map(ledger.entries.map((entry) => [entry.id, entry]));
  const lines = Object.entries(schedule.puzzles)
    .filter(([, puzzle]) => !puzzle.critic)
    .map(([date, puzzle]) => JSON.stringify({
      custom_id: `puzzle:${date}`,
      method: "POST",
      url: "/v1/responses",
      body: {
        model: MODEL,
        store: false,
        input: [
          {
            role: "developer",
            content: "Review this complete five-round vocabulary puzzle. Reject duplicate themes, semantic overlap, grammar or length giveaways, ambiguous distractors, poor difficulty balance, repeated synonyms, or any answer that could reasonably fit another round.",
          },
          { role: "user", content: JSON.stringify(puzzle.wordIds.map((id) => byId.get(id))) },
        ],
        text: { format: { type: "json_schema", name: "puzzle_review", strict: true, schema: puzzleSchema } },
      },
    }));
  const filename = path.join(batchDir, "puzzle-reviews.jsonl");
  await fs.writeFile(filename, `${lines.join("\n")}\n`, "utf8");
  console.log(`Prepared ${lines.length} puzzle critic requests at ${filename}`);
} else if (command === "submit") {
  if (!value) throw new Error("Usage: npm run batch:words -- submit <jsonl-path>");
  const bytes = await fs.readFile(path.resolve(value));
  const form = new FormData();
  form.set("purpose", "batch");
  form.set("file", new Blob([bytes]), path.basename(value));
  const uploaded = await (await api("/files", { method: "POST", body: form })).json();
  const batch = await (await api("/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input_file_id: uploaded.id, endpoint: "/v1/responses", completion_window: "24h" }),
  })).json();
  console.log(JSON.stringify({ batchId: batch.id, status: batch.status }, null, 2));
} else if (command === "status") {
  if (!value) throw new Error("Usage: npm run batch:words -- status <batch-id>");
  console.log(JSON.stringify(await (await api(`/batches/${value}`)).json(), null, 2));
} else if (command === "download") {
  if (!value) throw new Error("Usage: npm run batch:words -- download <batch-id>");
  const batch = await (await api(`/batches/${value}`)).json();
  if (!batch.output_file_id) throw new Error(`Batch has no output file; status=${batch.status}`);
  const output = await (await api(`/files/${batch.output_file_id}/content`)).text();
  const filename = path.join(batchDir, `${value}-output.jsonl`);
  await fs.writeFile(filename, output, "utf8");
  console.log(`Downloaded results to ${filename}`);
} else if (command === "apply-puzzles") {
  if (!value) throw new Error("Usage: npm run batch:words -- apply-puzzles <output-jsonl>");
  const schedulePath = path.resolve("content/daily-puzzles.json");
  const schedule = JSON.parse(await fs.readFile(schedulePath, "utf8"));
  const lines = (await fs.readFile(path.resolve(value), "utf8")).trim().split("\n");
  let applied = 0;
  for (const line of lines) {
    const result = JSON.parse(line);
    if (!result.custom_id?.startsWith("puzzle:") || result.response?.status_code !== 200) continue;
    const date = result.custom_id.slice("puzzle:".length);
    const text = outputText(result.response.body);
    if (!schedule.puzzles[date] || !text) continue;
    schedule.puzzles[date].critic = {
      ...JSON.parse(text),
      model: MODEL,
      version: 1,
      reviewedAt: new Date().toISOString(),
    };
    applied += 1;
  }
  schedule.generatedAt = new Date().toISOString();
  await fs.writeFile(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
  console.log(`Applied ${applied} puzzle critic results.`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
