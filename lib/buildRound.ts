import { RoundData } from "./types";

export async function buildRound(): Promise<RoundData> {
  return {
    word: "abate",
    partOfSpeech: "verb",
    synonym: "lessen",
    exampleSentence: "As night fell, the storm began to abate.",
    // For v0: first option is the correct one
    correctIndex: 0,
    choices: [
      "to become less intense; diminish", // correct
      "to decorate with fine detail",
      "a sudden loud noise",
      "to make public or announce",
    ],
  };
}