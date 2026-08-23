import { WORD_LEDGER } from "../../../lib/wordLedger";
import WordReviewTable from "../../../components/WordReviewTable";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function WordReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1>Lexiclues editorial ledger</h1>
      <p>
        Local review workspace. Saving is enabled only while running the development server.
      </p>
      <WordReviewTable initialEntries={WORD_LEDGER} />
    </main>
  );
}
