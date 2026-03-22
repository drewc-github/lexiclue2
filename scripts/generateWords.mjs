import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import process from "process";

dotenv.config({ path: ".env.local" });

const WORDNIK_BASE = "https://api.wordnik.com/v4";
const DATAMUSE_BASE = "https://api.datamuse.com/words";
const WORDNIK_API_KEY = process.env.WORDNIK_API_KEY;

if (!WORDNIK_API_KEY) {
    throw new Error("Missing WORDNIK_API_KEY in environment.");
}

const MAX_RESULTS_PER_QUERY = 30;
const MAX_DISCOVERED_TO_TRY = 200;
const MAX_ENRICH_ATTEMPTS = 100;
const MAX_NEW_WORDS = 12;

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

function escapeForTS(str) {
    return String(str)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, " ");
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

async function readExportedArray(filePath, exportName) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        const regex = new RegExp(`export const ${exportName} = (\\[[\\s\\S]*\\]);?`);
        const match = raw.match(regex);

        if (!match) return [];

        return Function(`"use strict"; return (${match[1]});`)();
    } catch {
        return [];
    }
}

async function loadBanks() {
    const seedPath = path.resolve("lib/seedWords.ts");
    const generatedPath = path.resolve("lib/generatedWords.ts");

    const seedWords = await readExportedArray(seedPath, "SEED_WORDS");
    const generatedWords = await readExportedArray(generatedPath, "GENERATED_WORDS");

    return { seedWords, generatedWords };
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
                limit: 10,
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
                limit: 5,
            }),
        ]);

        const bestDef =
            definitions.find((d) => d.text && d.partOfSpeech) ||
            definitions.find((d) => d.text);

        const definition = stripHtml(bestDef?.text);
        const partOfSpeech = bestDef?.partOfSpeech ?? "";

        const synonymBucket = related.find((r) => r.relationshipType === "synonym");
        const synonym =
            synonymBucket?.words?.find(
                (s) => normalize(s) !== normalize(word) && isGoodSurfaceWord(s)
            ) ?? word;

        const exampleSentence =
            stripHtml(
                examples?.examples?.find(
                    (e) => e.text && stripHtml(e.text).length >= 24
                )?.text
            ) ||
            stripHtml(examples?.examples?.[0]?.text) ||
            `The meaning of "${word}" became clear in context.`;

        if (!definition || !partOfSpeech) return null;
        if (!["noun", "verb", "adjective", "adverb"].includes(partOfSpeech)) return null;

        const normalizedWord = normalize(word);
        const normalizedDef = normalize(definition);

        // reject circular or low-quality defs
        if (definition.length < 12 || definition.length > 140) return null;
        if (normalizedDef === normalizedWord) return null;

        return {
            word,
            definition,
            partOfSpeech,
            synonym,
            exampleSentence,
        };
    } catch {
        return null;
    }
}

function formatGeneratedWordsFile(words) {
    const rows = words.map(
        (entry) => `  {
    word: "${escapeForTS(entry.word)}",
    definition: "${escapeForTS(entry.definition)}",
    partOfSpeech: "${escapeForTS(entry.partOfSpeech)}",
    synonym: "${escapeForTS(entry.synonym)}",
    exampleSentence: "${escapeForTS(entry.exampleSentence)}"
  }`
    );

    return `export const GENERATED_WORDS = [
${rows.join(",\n\n")}
];
`;
}

async function main() {
    const { seedWords, generatedWords } = await loadBanks();

    const allExistingWords = [...seedWords, ...generatedWords];
    const existingWordSet = new Set(allExistingWords.map((w) => normalize(w.word)));
    const existingDefinitionSet = new Set(
        allExistingWords.map((w) => normalize(w.definition))
    );

    const anchorWords = buildAnchorWords(seedWords);
    console.log(`Using ${anchorWords.length} anchor words from seed bank.`);

    const candidates = await discoverCandidates(anchorWords, existingWordSet);
    console.log(`Discovered ${candidates.length} shortlisted candidates.`);

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
        if (attempts >= MAX_ENRICH_ATTEMPTS) break;

        attempts += 1;
        console.log(`\nTrying ${candidate.word} (${attempts}/${MAX_ENRICH_ATTEMPTS})`);
        console.log(
            `  anchor=${candidate.sourceAnchor} pos=${candidate.datamusePos ?? "?"} freq=${candidate.datamuseFreq ?? "?"} score=${candidate.score}`
        );

        const entry = await enrichWord(candidate.word);
        await sleep(250);

        if (!entry) {
            console.log("  rejected: enrichment failed");
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

    const merged = [...generatedWords, ...accepted];
    const fileContent = formatGeneratedWordsFile(merged);

    await fs.writeFile(path.resolve("lib/generatedWords.ts"), fileContent, "utf8");

    console.log(`\nDone. Added ${accepted.length} new words to lib/generatedWords.ts`);
    console.log("Added words:", accepted.map((w) => w.word).join(", "));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});