import ledgerData from "../content/word-ledger.json";
import type { WordEntry } from "./types";

export type WordStatus =
  | "candidate"
  | "dictionary_verified"
  | "llm_reviewed"
  | "approved"
  | "rejected"
  | "retired";

export type LedgerEntry = WordEntry & {
  id: string;
  status: WordStatus;
  difficulty: number;
  reviewedAt: string;
  model: string;
  promptVersion: number;
  reviewVersion: number;
  timesUsed: number;
};

export const WORD_LEDGER = ledgerData.entries as LedgerEntry[];

export function getApprovedWords(): LedgerEntry[] {
  return WORD_LEDGER.filter((entry) => entry.status === "approved");
}
