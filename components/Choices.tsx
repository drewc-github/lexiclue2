"use client";

export default function Choices({
  choices = [],
  correctIndex,
  selectedIndex,
  onSelect,
  revealCorrectness = false,
  disabled = false,
}: {
  choices?: string[];
  correctIndex: number;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  revealCorrectness?: boolean;
  disabled?: boolean;
}) {
  // Safety: avoid crashing if something upstream passes undefined/null.
  if (!Array.isArray(choices)) return null;

  const longestChoice = choices.reduce(
    (longest, choice) => Math.max(longest, choice.trim().length),
    0
  );
  const totalChoiceLength = choices.reduce(
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
      {choices.map((c, i) => {
        const isSelected = selectedIndex === i;

        const showCorrectness = revealCorrectness && selectedIndex !== null;

        const classNames = [
          "choiceBtn",
          isSelected ? "selected" : "",
          showCorrectness && i === correctIndex ? "correct" : "",
          showCorrectness && isSelected && i !== correctIndex ? "wrong" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={i}
            type="button"
            className={classNames}
            onClick={() => {
              if (disabled) return;
              onSelect(i);
            }}
            disabled={disabled}
            aria-pressed={isSelected}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
