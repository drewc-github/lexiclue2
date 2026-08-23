import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import process from "process";

dotenv.config({ path: ".env.local" });

const WORDNIK_BASE = "https://api.wordnik.com/v4";
const DATAMUSE_BASE = "https://api.datamuse.com/words";
const WORDNIK_API_KEY = process.env.WORDNIK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

if (!WORDNIK_API_KEY) {
    throw new Error("Missing WORDNIK_API_KEY in environment.");
}

if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
}

const MAX_RESULTS_PER_QUERY = 30;
const MAX_DISCOVERED_TO_TRY = 200;
const MAX_ENRICH_ATTEMPTS = 100;
const MAX_NEW_WORDS = 12;
const MAX_LLM_REVIEW_ATTEMPTS = 30;
const PROMPT_VERSION = 3;

const BANNED_EASY_WORDS = new Set([
    "smart",
    "clear",
    "kind",
    "happy",
    "sad",
    "strong",
    "weak",
    "fast",
    "slow",
    "angry",
    "calm",
    "nice",
    "good",
    "bad",
    "big",
    "small",
    "brave",
    "funny",
    "honest",
    "careful",
    "strict",
    "shy",
    "wise",
    "rare",
    "brief",
    "practical",
    "change",
    "truth",
    "harm",
    "praise",
    "confuse",
    "lasting",
    "simple",
    "easy",
    "hard",
    "scary",
    "happy",
    "sad",
    "young",
    "old",
    "rich",
    "poor",
]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(str) {
    return String(str).trim().toLowerCase();
}

async function openaiStructured(name, schema, input) {
    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            store: false,
            input,
            text: {
                format: {
                    type: "json_schema",
                    name,
                    strict: true,
                    schema,
                },
            },
        }),
    });

    if (!res.ok) {
        throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    }

    const payload = await res.json();
    const outputText = payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((part) => part.type === "output_text")?.text;

    if (!outputText) throw new Error("OpenAI response did not contain structured output.");
    return JSON.parse(outputText);
}

async function proposeCandidates(existingWords) {
    const result = await openaiStructured(
        "lexiclues_candidates",
        {
            type: "object",
            additionalProperties: false,
            properties: {
                words: {
                    type: "array",
                    minItems: 30,
                    maxItems: 40,
                    items: { type: "string" },
                },
            },
            required: ["words"],
        },
        [
            {
                role: "developer",
                content: "Choose engaging English vocabulary for an adult daily learning game. Favor useful but challenging words, varied parts of speech, 6-12 alphabetic characters, and avoid proper nouns, archaic curiosities, offensive terms, and near-duplicates.",
            },
            {
                role: "user",
                content: `Propose 30-40 words not already in this bank: ${existingWords.join(", ")}`,
            },
        ]
    );

    return result.words
        .map(normalize)
        .filter((word) => isLikelyLexiclueWord(word) && !existingWords.includes(word));
}

async function critiqueEntry(entry, selectedSense) {
    return openaiStructured(
        "lexiclues_entry_critic",
        {
            type: "object",
            additionalProperties: false,
            properties: {
                accept: { type: "boolean" },
                issues: { type: "array", items: { type: "string" }, maxItems: 8 },
            },
            required: ["accept", "issues"],
        },
        [
            {
                role: "developer",
                content: "Act as a strict independent editor for a vocabulary game. Reject if the definition, part of speech, synonym, example sentence, or any distractor does not match the selected dictionary sense; if a distractor is arguably correct; if grammar gives the answer away; if wording is circular, obscure, awkward, or inappropriate; or if the example fails to demonstrate the intended sense.",
            },
            { role: "user", content: JSON.stringify({ entry, selectedSense }) },
        ]
    );
}

function isValidCurated(entry) {
    if (entry.definition.length < 16 || entry.definition.length > 120) return false;
    if (normalize(entry.definition).includes(normalize(entry.word))) return false;
    if (!isGoodExampleSentence(entry.exampleSentence, entry.word)) return false;
    if (!entry.synonym || normalize(entry.synonym) === normalize(entry.word)) return false;
    if (!Array.isArray(entry.distractors) || entry.distractors.length !== 3) return false;
    if (new Set(entry.distractors.map(normalize)).size !== 3) return false;
    if (entry.distractors.some((value) => value.length < 12 || value.length > 140)) return false;
    if (entry.distractors.some((value) => normalize(value) === normalize(entry.definition))) return false;
    return true;
}

async function repairEntry(entry, selectedSense, issues) {
    const result = await openaiStructured(
        "lexiclues_entry_repair",
        {
            type: "object",
            additionalProperties: false,
            properties: {
                definition: { type: "string" },
                synonym: { type: "string" },
                exampleSentence: { type: "string" },
                distractors: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: { type: "string" },
                },
            },
            required: ["definition", "synonym", "exampleSentence", "distractors"],
        },
        [
            {
                role: "developer",
                content: "Repair the vocabulary entry using the critic feedback. Every field must match only the selected dictionary sense. Keep the definition learner-friendly and non-circular, use an exact same-sense synonym, make the example demonstrate that sense, and make all three same-form distractors plausible but unambiguously wrong.",
            },
            { role: "user", content: JSON.stringify({ entry, selectedSense, issues }) },
        ]
    );

    return {
        ...entry,
        definition: String(result.definition).trim(),
        synonym: String(result.synonym).trim(),
        exampleSentence: String(result.exampleSentence).trim(),
        distractors: result.distractors.map((value) => String(value).trim()),
    };
}

async function curateEntry(bundle) {
    const result = await openaiStructured(
        "lexiclues_sense_selection",
        {
            type: "object",
            additionalProperties: false,
            properties: {
                accept: { type: "boolean" },
                senseIndex: { type: "integer" },
                definition: { type: "string" },
                synonym: { type: "string" },
                exampleSentence: { type: "string" },
                distractors: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: { type: "string" },
                },
            },
            required: ["accept", "senseIndex", "definition", "synonym", "exampleSentence", "distractors"],
        },
        [
            {
                role: "developer",
                content: "Build one coherent vocabulary-game entry from dictionary evidence. Choose the most useful, contemporary, teachable sense and return its zero-based senseIndex. Rewrite that sense in plain language without the target word, give a concise synonym for that exact sense, and write a natural sentence that clearly demonstrates it. Create exactly three plausible but definitely incorrect definitions with the same grammatical form and similar length. Reject archaic, offensive, highly technical, ambiguous, or poorly supported words.",
            },
            { role: "user", content: JSON.stringify(bundle) },
        ]
    );

    if (!result.accept) return null;
    const selectedSense = bundle.senses[result.senseIndex];
    if (!selectedSense) return null;

    const curated = {
        word: bundle.word,
        definition: String(result.definition).trim(),
        partOfSpeech: selectedSense.partOfSpeech,
        synonym: String(result.synonym).trim(),
        exampleSentence: String(result.exampleSentence).trim(),
        distractors: result.distractors.map((value) => String(value).trim()),
        sourceDictionary: selectedSense.sourceDictionary,
        sourceAttribution: selectedSense.attributionText,
    };

    if (!isValidCurated(curated)) return null;

    const critique = await critiqueEntry(curated, selectedSense);
    if (!critique.accept) {
        console.log(`  critic rejected: ${critique.issues.join("; ")}`);
        const repaired = await repairEntry(curated, selectedSense, critique.issues);
        if (!isValidCurated(repaired)) return null;
        const repairedCritique = await critiqueEntry(repaired, selectedSense);
        if (!repairedCritique.accept) {
            console.log(`  repaired entry rejected: ${repairedCritique.issues.join("; ")}`);
            return null;
        }
        console.log("  repaired entry accepted by critic");
        return repaired;
    }

    return curated;
}

function stripHtml(text = "") {
    return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function isGoodSurfaceWord(word) {
    return /^[a-z]+$/i.test(word) && word.length >= 6 && word.length <= 12;
}

function isLikelyLexiclueWord(word) {
    const w = normalize(word);
    if (!isGoodSurfaceWord(w)) return false;
    if (BANNED_EASY_WORDS.has(w)) return false;
    return true;
}

function getAdvancedSuffixBonus(word) {
    const suffixes = [
        "ous",
        "ive",
        "ent",
        "ant",
        "ate",
        "ity",
        "ory",
        "ious",
        "tion",
        "sion",
        "ious",
        "ical",
        "ious",
        "ence",
        "ancy",
        "ency",
    ];

    return suffixes.some((suffix) => word.endsWith(suffix)) ? 1 : 0;
}

function getDatamuseFreqFromTags(tags = []) {
    const freqTag = tags.find((tag) => typeof tag === "string" && tag.startsWith("f:"));
    if (!freqTag) return null;

    const value = Number(freqTag.slice(2));
    return Number.isFinite(value) ? value : null;
}

function getDatamusePOSFromTags(tags = []) {
    const allowed = ["n", "v", "adj", "adv"];
    return tags.find((tag) => allowed.includes(tag)) ?? null;
}

function mapDatamusePosToWordnik(pos) {
    if (pos === "n") return "noun";
    if (pos === "v") return "verb";
    if (pos === "adj") return "adjective";
    if (pos === "adv") return "adverb";
    return null;
}

function scoreCandidate({ word, freq, pos, anchor }) {
    let score = 0;
    const w = normalize(word);

    if (w.length >= 7) score += 1;
    if (w.length >= 8) score += 1;
    if (w.length >= 10) score += 1;

    if (freq != null) {
        if (freq >= 0.05 && freq <= 5) score += 2;
        else if (freq > 5 && freq <= 12) score += 1;
        else if (freq > 20) score -= 3;
        else if (freq < 0.002) score -= 2;
    }

    if (pos && ["adj", "n", "v"].includes(pos)) score += 1;
    if (getAdvancedSuffixBonus(w)) score += 1;
    if (BANNED_EASY_WORDS.has(w)) score -= 5;
    if (w === normalize(anchor)) score -= 10;

    return score;
}

async function datamuseFetch(params) {
    const url = new URL(DATAMUSE_BASE);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`Datamuse error ${res.status}`);
    }

    return res.json();
}

async function wordnikFetch(pathname, params = {}) {
    const url = new URL(`${WORDNIK_BASE}${pathname}`);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }

    url.searchParams.set("api_key", WORDNIK_API_KEY);

    const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Wordnik error ${res.status}: ${text}`);
    }

    return res.json();
}

async function loadBanks() {
    const ledger = JSON.parse(await fs.readFile(path.resolve("content/word-ledger.json"), "utf8"));
    return { ledger, seedWords: ledger.entries, generatedWords: [] };
}

function stableId(entry) {
    return `${entry.word}-${entry.partOfSpeech}-1`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

async function writeLedger(baseLedger, entries) {
    await fs.writeFile(
        path.resolve("content/word-ledger.json"),
        `${JSON.stringify({ ...baseLedger, updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
        "utf8"
    );
}

function buildAnchorWords(seedWords) {
    const anchors = [];
    const seen = new Set();

    for (const entry of seedWords) {
        const word = normalize(entry.word);
        if (!isLikelyLexiclueWord(word)) continue;
        if (seen.has(word)) continue;

        seen.add(word);
        anchors.push(word);
    }

    return anchors;
}

async function discoverCandidates(anchorWords, existingWordSet) {
    const candidates = new Map();

    for (const anchor of anchorWords) {
        const queries = [
            { ml: anchor, md: "pf", max: MAX_RESULTS_PER_QUERY },
            { rel_syn: anchor, md: "pf", max: MAX_RESULTS_PER_QUERY },
        ];

        for (const query of queries) {
            try {
                const results = await datamuseFetch(query);

                for (const item of results) {
                    const word = normalize(item?.word);
                    if (!word) continue;
                    if (!isLikelyLexiclueWord(word)) continue;
                    if (existingWordSet.has(word)) continue;
                    if (word === anchor) continue;

                    const tags = Array.isArray(item?.tags) ? item.tags : [];
                    const freq = getDatamuseFreqFromTags(tags);
                    const pos = getDatamusePOSFromTags(tags);

                    const score = scoreCandidate({
                        word,
                        freq,
                        pos,
                        anchor,
                    });

                    const existing = candidates.get(word);

                    if (!existing || score > existing.score) {
                        candidates.set(word, {
                            word,
                            sourceAnchor: anchor,
                            datamuseFreq: freq,
                            datamusePos: pos,
                            score,
                        });
                    }
                }
            } catch (err) {
                console.warn(`Datamuse query failed for "${anchor}": ${err.message}`);
            }
        }

        await sleep(60);
    }

    return [...candidates.values()]
        .filter((c) => c.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DISCOVERED_TO_TRY);
}

async function enrichWord(word) {
    try {
        const [definitions, related, examples] = await Promise.all([
            wordnikFetch(`/word.json/${encodeURIComponent(word)}/definitions`, {
                limit: 20,
                useCanonical: true,
                includeTags: false,
            }),
            wordnikFetch(`/word.json/${encodeURIComponent(word)}/relatedWords`, {
                useCanonical: true,
                relationshipTypes: "synonym",
                limitPerRelationshipType: 10,
            }),
            wordnikFetch(`/word.json/${encodeURIComponent(word)}/examples`, {
                useCanonical: true,
                limit: 10,
            }),
        ]);

        const senses = definitions
            .map((definition) => ({
                definition: cleanDefinition(definition?.text),
                partOfSpeech: definition?.partOfSpeech ?? "",
                sourceDictionary: definition?.sourceDictionary ?? "Wordnik",
                attributionText:
                    definition?.attributionText ?? `Definition source: ${definition?.sourceDictionary ?? "Wordnik"}`,
            }))
            .filter(
                (sense) =>
                    sense.definition &&
                    ["noun", "verb", "adjective", "adverb"].includes(sense.partOfSpeech) &&
                    sense.definition.length >= 8 &&
                    sense.definition.length <= 240
            )
            .filter(
                (sense, index, all) =>
                    all.findIndex(
                        (other) =>
                            normalize(other.definition) === normalize(sense.definition) &&
                            other.partOfSpeech === sense.partOfSpeech
                    ) === index
            );

        if (senses.length === 0) return null;
        const synonyms = related
            .filter((bucket) => bucket.relationshipType === "synonym")
            .flatMap((bucket) => bucket.words ?? [])
            .filter((synonym) => normalize(synonym) !== normalize(word));
        const rawExamples = Array.isArray(examples?.examples) ? examples.examples : [];

        return {
            word,
            senses,
            synonyms: [...new Set(synonyms)].slice(0, 30),
            examples: rawExamples
                .map((example) => cleanExampleSentence(example?.text))
                .filter(Boolean)
                .slice(0, 10),
        };
    } catch {
        return null;
    }
}

function cleanDefinition(text = "") {
    let def = stripHtml(text).replace(/\s+/g, " ").trim();

    // Remove leading labels
    def = def.replace(/^(synonym|synonyms)\s*[:\-]\s*/i, "");
    def = def.replace(/^(see also|see)\s+.+$/i, "");

    // Remove giveaway phrases inside the definition
    def = def.replace(/\b(synonym|synonyms)\s+(is|are)\s+[^.;]+[.;]?/gi, "");
    def = def.replace(/\bor\s+"?[^"]+"?\s+as a synonym[^.;]*[.;]?/gi, "");

    // Clean up punctuation left behind
    def = def.replace(/\s{2,}/g, " ").trim();
    def = def.replace(/^[,;:\- ]+|[,;:\- ]+$/g, "").trim();

    return def;
}

function cleanExampleSentence(text = "") {
    return stripHtml(text)
        .replace(/\s+/g, " ")
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
        .trim();
}

function isGoodExampleSentence(sentence, word) {
    if (!sentence) return false;

    const s = cleanExampleSentence(sentence);
    const lower = normalize(s);
    const lowerWord = normalize(word);

    if (s.length < 24) return false;
    if (s.length > 140) return false;

    // Avoid weird dictionary-style fragments
    if (!/[.!?]$/.test(s)) return false;

    // Prefer real context sentences that actually use the word
    if (!lower.includes(lowerWord)) return false;

    return true;
}

async function reprocessBank(entries, label, repairOnly = false, outdatedOnly = false) {
    const reviewed = [];
    let improved = 0;

    for (let index = 0; index < entries.length; index += 1) {
        const existing = entries[index];
        if (outdatedOnly && (existing.promptVersion ?? 0) >= PROMPT_VERSION) {
            reviewed.push(existing);
            continue;
        }
        if (repairOnly && existing.distractors?.length === 3) {
            reviewed.push(existing);
            continue;
        }
        console.log(`\nReviewing ${label} ${index + 1}/${entries.length}: ${existing.word}`);

        let bundle = await enrichWord(existing.word);
        if (!bundle) {
            console.log("  Wordnik unavailable; reviewing the existing editorial sense.");
            bundle = {
                word: existing.word,
                senses: [{
                    definition: existing.definition,
                    partOfSpeech: existing.partOfSpeech,
                    sourceDictionary: existing.sourceDictionary ?? "Lexiclues editorial bank",
                    attributionText: existing.sourceAttribution ?? "Lexiclues editorial entry",
                }],
                synonyms: existing.synonym ? [existing.synonym] : [],
                examples: existing.exampleSentence ? [existing.exampleSentence] : [],
            };
        }

        try {
            const curated = await curateEntry(bundle);
            if (curated) {
                reviewed.push({
                    ...existing,
                    ...curated,
                    id: existing.id ?? stableId(curated),
                    status: "approved",
                    reviewedAt: new Date().toISOString().slice(0, 10),
                    model: OPENAI_MODEL,
                    promptVersion: PROMPT_VERSION,
                    reviewVersion: (existing.reviewVersion ?? 0) + 1,
                });
                improved += 1;
                console.log("  accepted by sense selector and critic");
            } else {
                reviewed.push(existing);
                console.log("  retained existing entry after rejection");
            }
        } catch (error) {
            reviewed.push(existing);
            console.warn(`  retained existing entry after API error: ${error.message}`);
        }
    }

    return { reviewed, improved };
}

async function reprocessAllBanks(baseLedger, seedWords, generatedWords, repairOnly = false, outdatedOnly = false) {
    const seedResult = await reprocessBank(seedWords, "ledger word", repairOnly, outdatedOnly);
    const generatedResult = await reprocessBank(generatedWords, "generated word", repairOnly, outdatedOnly);

    await writeLedger(baseLedger, [...seedResult.reviewed, ...generatedResult.reviewed]);

    console.log(
        `\nReprocessed banks: ${seedResult.improved}/${seedWords.length} seed and ${generatedResult.improved}/${generatedWords.length} generated entries improved.`
    );
}

async function main() {
    const { ledger, seedWords, generatedWords } = await loadBanks();

    if (
        process.argv.includes("--reprocess") ||
        process.argv.includes("--repair-missing") ||
        process.argv.includes("--outdated")
    ) {
        await reprocessAllBanks(
            ledger,
            seedWords,
            generatedWords,
            process.argv.includes("--repair-missing"),
            process.argv.includes("--outdated")
        );
        return;
    }

    const allExistingWords = [...seedWords, ...generatedWords];
    const existingWordSet = new Set(allExistingWords.map((w) => normalize(w.word)));
    const existingDefinitionSet = new Set(
        allExistingWords.map((w) => normalize(w.definition))
    );

    const anchorWords = buildAnchorWords(seedWords);
    console.log(`Using ${anchorWords.length} anchor words from seed bank.`);

    console.log(`Requesting candidate ideas from ${OPENAI_MODEL}.`);
    const llmWords = await proposeCandidates([...existingWordSet]);
    const llmCandidates = llmWords.map((word) => ({
        word,
        sourceAnchor: "openai",
        datamuseFreq: null,
        datamusePos: null,
        score: 10,
    }));
    const discoveredCandidates = await discoverCandidates(anchorWords, existingWordSet);
    const candidates = [...llmCandidates, ...discoveredCandidates].filter(
        (candidate, index, all) =>
            all.findIndex((other) => other.word === candidate.word) === index
    );
    console.log(
        `Shortlisted ${candidates.length} candidates (${llmCandidates.length} LLM-proposed).`
    );

    if (candidates.length > 0) {
        console.log(
            "Top candidates:",
            candidates.slice(0, 20).map((c) => `${c.word} [score=${c.score}]`)
        );
    }

    const accepted = [];
    let attempts = 0;

    for (const candidate of candidates) {
        if (accepted.length >= MAX_NEW_WORDS) break;
        if (attempts >= Math.min(MAX_ENRICH_ATTEMPTS, MAX_LLM_REVIEW_ATTEMPTS)) break;

        attempts += 1;
        console.log(
            `\nTrying ${candidate.word} (${attempts}/${Math.min(MAX_ENRICH_ATTEMPTS, MAX_LLM_REVIEW_ATTEMPTS)})`
        );
        console.log(
            `  anchor=${candidate.sourceAnchor} pos=${candidate.datamusePos ?? "?"} freq=${candidate.datamuseFreq ?? "?"} score=${candidate.score}`
        );

        const dictionaryEntry = await enrichWord(candidate.word);
        await sleep(250);

        if (!dictionaryEntry) {
            console.log("  rejected: enrichment failed");
            continue;
        }

        const entry = await curateEntry(dictionaryEntry);
        if (!entry) {
            console.log("  rejected: LLM quality review failed");
            continue;
        }

        if (existingDefinitionSet.has(normalize(entry.definition))) {
            console.log("  rejected: duplicate definition");
            continue;
        }

        if (accepted.some((w) => normalize(w.word) === normalize(entry.word))) {
            console.log("  rejected: duplicate word in batch");
            continue;
        }

        if (accepted.some((w) => normalize(w.definition) === normalize(entry.definition))) {
            console.log("  rejected: duplicate definition in batch");
            continue;
        }

        const datamuseWordnikPosMatch =
            candidate.datamusePos == null ||
            mapDatamusePosToWordnik(candidate.datamusePos) === entry.partOfSpeech;

        if (!datamuseWordnikPosMatch) {
            console.log("  rejected: POS mismatch between Datamuse and Wordnik");
            continue;
        }

        accepted.push(entry);
        console.log(`  accepted: ${entry.word}`);
    }

    if (accepted.length === 0) {
        console.log("No new words accepted.");
        return;
    }

    const dated = new Date().toISOString().slice(0, 10);
    const ledgerEntries = [
        ...ledger.entries,
        ...accepted.map((entry) => ({
            id: stableId(entry),
            ...entry,
            status: "approved",
            difficulty: entry.word.length >= 10 ? 4 : entry.word.length >= 8 ? 3 : 2,
            reviewedAt: dated,
            model: OPENAI_MODEL,
            promptVersion: PROMPT_VERSION,
            reviewVersion: 1,
            timesUsed: 0,
        })),
    ];
    await writeLedger(ledger, ledgerEntries);

    console.log(`\nDone. Added ${accepted.length} new words to content/word-ledger.json`);
    console.log("Added words:", accepted.map((w) => w.word).join(", "));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
