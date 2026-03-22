"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HintType, RoundData } from "../lib/types";
import { MessageSquareText, Repeat, Pencil } from "lucide-react";

const SWITCH_MS = 240;
const SWITCH_HALF = 120;

export default function WordCard({
  round,
  used,
  onUseHint,
  disableHints = false,
}: {
  round: RoundData;
  used: Record<HintType, boolean>;
  onUseHint: (h: HintType) => void;
  disableHints?: boolean;
}) {
  const [active, setActive] = useState<HintType | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const timersRef = useRef<number[]>([]);
  const queuedHintRef = useRef<HintType | null>(null);

  // Synchronous truth for switching (don’t rely on async React state)
  const switchingRef = useRef(false);

  function setSwitching(next: boolean) {
    switchingRef.current = next;
    setIsSwitching(next);
  }

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }

  function schedule(fn: () => void, ms: number) {
    const t = window.setTimeout(fn, ms);
    timersRef.current.push(t);
  }

  useEffect(() => {
    return () => {
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Stronger round reset key (works even if word repeats)
  const roundResetKey = useMemo(() => {
    return [
      round.word,
      round.partOfSpeech ?? "",
      round.synonym ?? "",
      round.exampleSentence ?? "",
    ].join("|");
  }, [round.word, round.partOfSpeech, round.synonym, round.exampleSentence]);

  useEffect(() => {
    clearTimers();
    queuedHintRef.current = null;
    setSwitching(false);
    setActive(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundResetKey]);

  const usedCount = Object.values(used).filter(Boolean).length;
  const remaining = Math.max(0, 3 - usedCount);
  const hintsLocked = usedCount >= 3;

  function flipToFront() {
    if (switchingRef.current) return;
    clearTimers();
    queuedHintRef.current = null;
    setSwitching(false);
    setActive(null);
  }

  function reveal(h: HintType) {
    if (disableHints) return;
    if (hintsLocked) return;

    // If switching, remember the last hint the user asked for
    if (switchingRef.current) {
      queuedHintRef.current = h;
      return;
    }

    // If already showing this hint on the back, do nothing
    if (active === h) return;

    // Charge only the first time
    if (!used[h]) onUseHint(h);

    clearTimers();

    // If we're already on the back, wobble + swap text mid-way
    if (active !== null) {
      setSwitching(false);
      requestAnimationFrame(() => setSwitching(true));

      schedule(() => setActive(h), SWITCH_HALF);

      schedule(() => {
        // IMPORTANT: make switching false synchronously BEFORE processing queue
        setSwitching(false);

        const next = queuedHintRef.current;
        queuedHintRef.current = null;

        if (next) reveal(next);
      }, SWITCH_MS);

      return;
    }

    // If on front, flip normally to the first hint
    setActive(h);
  }

  function getHintLabel(hint: HintType | null) {
    if (hint === "pos") return "Part of Speech";
    if (hint === "synonym") return "Synonym";
    if (hint === "sentence") return "Example Sentence";
    return "";
  }

  const flipped = active !== null;

  const hintText =
    active === "pos"
      ? round.partOfSpeech ?? ""
      : active === "synonym"
        ? round.synonym ?? ""
        : active === "sentence"
          ? round.exampleSentence ?? ""
          : "";

  return (
    <div className="card">
      {/* Make the whole tile clickable like NYT */}
      <div
        className={`cardInner ${flipped ? "flipped" : ""} ${isSwitching ? "switching" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Flip to word" : "Flip to clue"}
        onClick={() => {
          if (flipped) flipToFront();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (flipped) flipToFront();
          }
        }}
      >
        <div className="cardFace">
          <div className="counter">{remaining}</div>
          {round.word}
        </div>

        <div className="cardFace cardBack">
          {active && <div className="hintBackLabel">{getHintLabel(active)}</div>}
          <div className="cardBackText">{hintText}</div>
        </div>
      </div>

      <div className="sectionBlock">
        <div className="sectionLabel">Hints</div>

        <div className="hints">
          <button
            type="button"
            className={`hintBtn hintPos ${used.pos ? "used" : ""}`}
            onClick={() => reveal("pos")}
            disabled={disableHints || hintsLocked}
            aria-label="Part of Speech"
          >
            <MessageSquareText size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            className={`hintBtn hintSyn ${used.synonym ? "used" : ""}`}
            onClick={() => reveal("synonym")}
            disabled={disableHints || hintsLocked}
            aria-label="Synonym"
          >
            <Repeat size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            className={`hintBtn hintSent ${used.sentence ? "used" : ""}`}
            onClick={() => reveal("sentence")}
            disabled={disableHints || hintsLocked}
            aria-label="Example Sentence"
          >
            <Pencil size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}