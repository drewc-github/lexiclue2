import { getDailyGame } from "@/lib/buildDailyGame";

export async function GET() {
  return Response.json(await getDailyGame());
}
