import { getDailyGame, isValidDateKey } from "@/lib/buildDailyGame";

export async function GET(request: Request) {
  const dateKey = new URL(request.url).searchParams.get("date");

  if (!dateKey || !isValidDateKey(dateKey)) {
    return Response.json(
      { error: "A valid date in YYYY-MM-DD format is required." },
      { status: 400 }
    );
  }

  return Response.json(await getDailyGame(dateKey), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
