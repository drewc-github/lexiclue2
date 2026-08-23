export type HintType = "pos" | "synonym" | "sentence";

export type WordEntry = {
  id?: string;
  word: string;
  definition: string;
  partOfSpeech: string;
  synonym: string;
  exampleSentence: string;
  distractors?: string[];
  sourceDictionary?: string;
  sourceAttribution?: string;
  difficulty?: number;
};

export type RoundData = {
  word: string;
  choices: string[];
  correctIndex: number;
  partOfSpeech?: string;
  synonym?: string;
  exampleSentence?: string;
  sourceAttribution?: string;
};

export type DailyGame = {
  dateKey: string;
  rounds: RoundData[];
};
