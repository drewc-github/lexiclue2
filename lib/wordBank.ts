import { unstable_cache } from "next/cache";
import { enrichWord, getRandomCandidateWords, type WordnikEntry } from "./wordnik";

async function buildWordBank(): Promise<WordnikEntry[]> {
    const candidates = await getRandomCandidateWords(12);

    const enriched: WordnikEntry[] = [];

    for (const word of candidates) {
        if (enriched.length >= 8) break;

        const entry = await enrichWord(word);
        if (!entry) continue;

        const isDuplicate = enriched.some(
            (e) => e.word.toLowerCase() === entry.word.toLowerCase()
        );

        if (isDuplicate) continue;

        enriched.push(entry);
    }

    if (enriched.length < 8) {
        throw new Error(`Only found ${enriched.length} usable Wordnik entries`);
    }

    return enriched;
}

const getCachedWordBank = unstable_cache(
    async () => buildWordBank(),
    ["lexiclue-word-bank"],
    { revalidate: 60 * 60 * 24 * 7 } // refresh weekly
);

export async function getWordBank(): Promise<WordnikEntry[]> {
    return getCachedWordBank();
}