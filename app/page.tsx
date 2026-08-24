import DailyGameLoader from "../components/DailyGameLoader";
import { getDailyGame } from "../lib/buildDailyGame";

export default async function Page() {
  const daily = await getDailyGame();
  return <DailyGameLoader initialDaily={daily} />;
}
