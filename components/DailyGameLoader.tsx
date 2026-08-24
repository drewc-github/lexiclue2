"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyGame } from "../lib/types";
import LexiClueIntroGate from "./LexiClueIntroGate";

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function millisecondsUntilNextLocalDay(now = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  return Math.max(1_000, nextMidnight.getTime() - now.getTime() + 100);
}

export default function DailyGameLoader({
  initialDaily,
}: {
  initialDaily: DailyGame;
}) {
  const [daily, setDaily] = useState(initialDaily);
  const dailyRef = useRef(daily);

  useEffect(() => {
    dailyRef.current = daily;
  }, [daily]);

  const refreshForDeviceDate = useCallback(async () => {
    const localDateKey = getLocalDateKey();
    if (dailyRef.current.dateKey === localDateKey) return;

    try {
      const response = await fetch(
        `/api/daily?date=${encodeURIComponent(localDateKey)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;

      const nextDaily = (await response.json()) as DailyGame;
      dailyRef.current = nextDaily;
      setDaily(nextDaily);
    } catch {
      // Keep the current game available if the rollover request fails.
    }
  }, []);

  useEffect(() => {
    void refreshForDeviceDate();

    let midnightTimer = window.setTimeout(function rollover() {
      void refreshForDeviceDate();
      midnightTimer = window.setTimeout(
        rollover,
        millisecondsUntilNextLocalDay()
      );
    }, millisecondsUntilNextLocalDay());

    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void refreshForDeviceDate();
      }
    };

    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);

    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refreshForDeviceDate]);

  return <LexiClueIntroGate key={daily.contentKey} daily={daily} />;
}
