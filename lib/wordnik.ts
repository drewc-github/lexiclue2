import { unstable_cache } from "next/cache";

const WORDNIK_BASE = "https://api.wordnik.com/v4";

type RandomWord = { word: string };
type Definition = { text?: string; partOfSpeech?: string };
type RelatedWord = { relationshipType?: string; words?: string[] };
type Example = { text?: string };
type ExamplesResponse = { examples?: Example[] };

export type WordnikEntry = {
  word: string;
  definition: string;
  partOfSpeech: string;
  synonym: string;
  exampleSentence: string;
};

function getApiKey() {
  const key = process.env.WORDNIK_API_KEY;
  if (!key) throw new Error("Missing WORDNIK_API_KEY");
  return key;
}

async function wordnikFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const url = new URL(`${WORDNIK_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("api_key", getApiKey());

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wordnik error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

function stripHtml(text?: string) {
  return (text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableWord(word: string) {
  return /^[a-zA-Z-]+$/.test(word) && word.length >= 4 && word.length <= 12;
}

export async function getRandomCandidateWords(limit = 12): Promise<string[]> {
  const words = await wordnikFetch<RandomWord[]>("/words.json/randomWords", {
    limit,
    hasDictionaryDef: true,
    minDictionaryCount: 2,
    minCorpusCount: 1000,
    includePartOfSpeech: "noun,verb,adjective,adverb",
    maxLength: 12,
  });

  const seen = new Set<string>();

  return words
    .map((w) => w.word?.trim())
    .filter((w): w is string => !!w)
    .filter(isUsableWord)
    .filter((w) => {
      const key = w.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function enrichWordRaw(word: string): Promise<WordnikEntry | null> {
  try {
    const [definitions, related, examples] = await Promise.all([
      wordnikFetch<Definition[]>(
        `/word.json/${encodeURIComponent(word)}/definitions`,
        {
          limit: 10,
          useCanonical: true,
          includeTags: false,
        }
      ),
      wordnikFetch<RelatedWord[]>(
        `/word.json/${encodeURIComponent(word)}/relatedWords`,
        {
          useCanonical: true,
          relationshipTypes: "synonym",
          limitPerRelationshipType: 10,
        }
      ),
      wordnikFetch<ExamplesResponse>(
        `/word.json/${encodeURIComponent(word)}/examples`,
        {
          useCanonical: true,
          limit: 5,
        }
      ),
    ]);

    const bestDef =
      definitions.find((d) => d.text && d.partOfSpeech) ??
      definitions.find((d) => d.text);

    const definition = stripHtml(bestDef?.text);
    const partOfSpeech = bestDef?.partOfSpeech ?? "";

    const synonymBucket = related.find(
      (r) => r.relationshipType === "synonym"
    );

    const synonym =
      synonymBucket?.words?.find(
        (s) => s.toLowerCase() !== word.toLowerCase()
      ) ?? "";

    const exampleSentence =
      stripHtml(
        examples.examples?.find(
          (e) => e.text && stripHtml(e.text).length > 24
        )?.text
      ) || stripHtml(examples.examples?.[0]?.text);

    if (!definition || !partOfSpeech || !synonym || !exampleSentence) {
      return null;
    }

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

const enrichWordCached = unstable_cache(
  async (word: string) => enrichWordRaw(word),
  ["wordnik-enrich-word"],
  { revalidate: 60 * 60 * 24 * 7 }
);

export async function enrichWord(word: string): Promise<WordnikEntry | null> {
  return enrichWordCached(word);
}