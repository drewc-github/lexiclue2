"use client";

import { useEffect, useState } from "react";

export default function Choices({
  choices = [],
  correctIndex,
  selectedIndex,
  eliminatedIndex = null,
  onSelect,
  revealCorrectness = false,
  disabled = false,
}: {
  choices?: string[];
  correctIndex: number;
  selectedIndex: number | null;
  eliminatedIndex?: number | null;
  onSelect: (i: number) => void;
  revealCorrectness?: boolean;
  disabled?: boolean;
}) {
  // Safety: avoid crashing if something upstream passes undefined/null.
  const safeChoices = Array.isArray(choices) ? choices : [];

  const [settledEliminatedIndex, setSettledEliminatedIndex] = useState(
    eliminatedIndex
  );

  useEffect(() => {
    if (eliminatedIndex === null) return;

    const timer = window.setTimeout(
      () => setSettledEliminatedIndex(eliminatedIndex),
      680
    );
    return () => window.clearTimeout(timer);
  }, [eliminatedIndex]);

  const sizingChoices = settledEliminatedIndex === eliminatedIndex && eliminatedIndex !== null
    ? safeChoices.filter((_, index) => index !== eliminatedIndex)
    : safeChoices;
  const longestChoice = sizingChoices.reduce(
    (longest, choice) => Math.max(longest, choice.trim().length),
    0
  );
  const totalChoiceLength = sizingChoices.reduce(
    (total, choice) => total + choice.trim().length,
    0
  );
  const densityClass =
    longestChoice >= 78 || totalChoiceLength >= 245
      ? "choiceListDense"
      : longestChoice >= 60 || totalChoiceLength >= 215
        ? "choiceListCompact"
        : "choiceListStandard";

  return (
    <div
      className={`choiceList ${densityClass} ${selectedIndex !== null ? "hasSelection" : ""}`}
    >
      {safeChoices.map((c, i) => {
        const isSelected = selectedIndex === i;
        const isEliminated = eliminatedIndex === i;

        const showCorrectness = revealCorrectness && selectedIndex !== null;

        const classNames = [
          "choiceBtn",
          isSelected ? "selected" : "",
          isEliminated ? "eliminated" : "",
          showCorrectness && i === correctIndex ? "correct" : "",
          showCorrectness && isSelected && i !== correctIndex ? "wrong" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={i}
            className={`choiceSlot ${isEliminated ? "eliminated" : ""}`}
            aria-hidden={isEliminated}
          >
            <div className="choiceSlotInner">
              <button
                type="button"
                className={classNames}
                onClick={() => {
                  if (disabled || isEliminated) return;
                  onSelect(i);
                }}
                disabled={disabled || isEliminated}
                aria-pressed={isSelected}
                aria-label={c}
                tabIndex={isEliminated ? -1 : undefined}
              >
                {c}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
