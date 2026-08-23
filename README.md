# Lexiclues

Lexiclues is a five-round daily vocabulary game built with Next.js and TypeScript. Every player receives the same deterministic puzzle for the New York calendar date. Progress is stored locally per daily puzzle.

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run validate:content
npm run build
```

## Word generation

Word generation is an offline editorial workflow; the live game never waits on an external dictionary or model. The generator asks an OpenAI model for candidate vocabulary and pedagogical curation, verifies candidates against Wordnik, applies deterministic validation, and writes approved entries to the versioned ledger at `content/word-ledger.json`.

Add these server-side values to `.env.local`:

```text
WORDNIK_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4
```

Wordnik definitions are cached locally in `work/wordnik-cache.json`. The generator makes one Wordnik request per candidate, throttles requests to stay below the default five-per-minute limit, and automatically waits and retries when Wordnik returns HTTP 429. Set `WORDNIK_MIN_INTERVAL_MS` only if your Wordnik plan has a different documented limit.

Then run:

```bash
npm run generate:words
```

To re-evaluate every existing entry against all available Wordnik senses, generate tailored distractors, and run the independent LLM critic:

```bash
npm run review:words
```

To backfill only entries created with an older prompt version:

```bash
npm run backfill:words
```

## Editorial review

Run the development server and open `http://localhost:3000/admin/words` to search, edit, approve, reject, or retire ledger entries. The save endpoint is disabled in production.

Each ledger record carries a stable ID, editorial status, difficulty, attribution, prompt/model version, review version, and schedule usage count.

## Frozen daily puzzles

`content/daily-puzzles.json` freezes word IDs by New York calendar date so later bank changes cannot alter an already assigned puzzle. Extend the schedule without changing existing dates:

```bash
npm run schedule:games
```

Use `node scripts/generateSchedule.mjs --rebuild` only before publishing a newly generated schedule. The content validator checks the ledger, answer choices, attributions, POS balance, and the ten-day repeat window.

## Batch reviews

Large word and puzzle reviews can be prepared as Batch API JSONL files under `work/lexiclues-batches`:

```bash
npm run batch:words -- prepare-words
npm run batch:words -- prepare-puzzles
npm run batch:words -- submit work/lexiclues-batches/puzzle-reviews.jsonl
npm run batch:words -- status BATCH_ID
npm run batch:words -- download BATCH_ID
npm run batch:words -- apply-puzzles work/lexiclues-batches/BATCH_ID-output.jsonl
```

Batch submission is asynchronous and is intended for large backfills. Normal small word additions should continue using `npm run generate:words`.

Review the generated diff before committing it. Neither API key is exposed to the browser, and `.env.local` is ignored by Git.
