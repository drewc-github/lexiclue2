import LexiClueIntroGate from "../components/LexiClueIntroGate";
import { getDailyGame } from "../lib/buildDailyGame";

export default async function Page() {
  const daily = await getDailyGame();
  return <LexiClueIntroGate daily={daily} />;
}