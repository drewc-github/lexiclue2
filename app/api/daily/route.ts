import { buildRound } from "@/lib/buildRound";

export async function GET() {
  const rounds = await Promise.all([
    buildRound(),
    buildRound(),
    buildRound(),
    buildRound(),
    buildRound(),
  ]);

  return Response.json({
    dateKey: "v0",
    rounds,
  });
}