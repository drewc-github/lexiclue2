export type HintType = "pos" | "synonym" | "sentence";

export type RoundData = {
  word: string;
  choices: string[];
  correctIndex: number;
  partOfSpeech?: string;
  synonym?: string;
  exampleSentence?: string;
};

export type DailyGame = {
  dateKey: string;
  rounds: RoundData[];
};