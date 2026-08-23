function hashString(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  const rand = mulberry32(hashString(seedStr)());
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectDailyEntries<T>(entries: T[], dateKey: string, count = 5): T[] {
  if (entries.length < count) throw new Error(`Not enough entries: ${entries.length}`);
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  if (!Number.isFinite(dayNumber)) throw new Error(`Invalid date key: ${dateKey}`);
  const daysPerCycle = Math.max(1, Math.floor(entries.length / count));
  const cycle = Math.floor(dayNumber / daysPerCycle);
  const slot = ((dayNumber % daysPerCycle) + daysPerCycle) % daysPerCycle;
  const ordered = seededShuffle(entries, `lexiclues-bank-cycle:${cycle}`);
  return ordered.slice(slot * count, slot * count + count);
}
