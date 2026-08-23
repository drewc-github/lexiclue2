import fs from "fs/promises";
import path from "path";
import type { LedgerEntry } from "../../../../lib/wordLedger";

export async function PUT(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Local development only" }, { status: 403 });
  }

  const incoming = (await request.json()) as LedgerEntry;
  if (!incoming.id || !incoming.word || !Array.isArray(incoming.distractors)) {
    return Response.json({ error: "Invalid ledger entry" }, { status: 400 });
  }

  const ledgerPath = path.join(process.cwd(), "content", "word-ledger.json");
  const ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8")) as {
    updatedAt: string;
    entries: LedgerEntry[];
  };
  const index = ledger.entries.findIndex((entry) => entry.id === incoming.id);
  if (index < 0) return Response.json({ error: "Unknown entry" }, { status: 404 });

  ledger.entries[index] = {
    ...incoming,
    reviewedAt: new Date().toISOString().slice(0, 10),
    reviewVersion: ledger.entries[index].reviewVersion + 1,
  };
  ledger.updatedAt = new Date().toISOString();
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return Response.json({ ok: true });
}
