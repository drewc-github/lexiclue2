"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
  const [isConfirming, setIsConfirming] = useState(false);
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
  }, []);

  const usedCount = Object.values(used).filter(Boolean).length;
  const hintsLocked = usedCount >= 3;

  function flipToFront() {
    if (switchingRef.current) return;
    clearTimers();
    queuedHintRef.current = null;
    setSwitching(false);
    setIsConfirming(false);
    setActive(null);
  }

  useEffect(() => {
    if (!isConfirming) return;

    document.body.classList.add("hint-confirming");

    function cancelFromOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".hintConfirmBtn")) return;

      // Confirmation temporarily takes priority over every other control on
      // the page. The intercepted click only cancels the pending hint.
      event.preventDefault();
      event.stopImmediatePropagation();
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      queuedHintRef.current = null;
      switchingRef.current = false;
      setIsSwitching(false);
      setIsConfirming(false);
      setActive(null);
    }

    document.addEventListener("click", cancelFromOutsideClick, true);
    return () => {
      document.removeEventListener("click", cancelFromOutsideClick, true);
      document.body.classList.remove("hint-confirming");
    };
  }, [isConfirming]);

  function reveal(h: HintType) {
    if (disableHints) return;
    if (hintsLocked) return;

    // If switching, remember the last hint the user asked for
    if (switchingRef.current) {
      queuedHintRef.current = h;
      return;
    }

    // If already showing this hint in the same state, do nothing.
    if (active === h && isConfirming === !used[h]) return;

    clearTimers();

    // If we're already on the back, wobble + swap text mid-way
    if (active !== null) {
      setSwitching(false);
      requestAnimationFrame(() => setSwitching(true));

      schedule(() => {
        setActive(h);
        setIsConfirming(!used[h]);
      }, SWITCH_HALF);

      schedule(() => {
        // IMPORTANT: make switching false synchronously BEFORE processing queue
        setSwitching(false);

        const next = queuedHintRef.current;
        queuedHintRef.current = null;

        if (next) reveal(next);
      }, SWITCH_MS);

      return;
    }

    // New hints ask for confirmation before points are deducted. Previously
    // purchased hints can be viewed again immediately at no additional cost.
    setIsConfirming(!used[h]);
    setActive(h);
  }

  function confirmHint(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!active || used[active]) return;

    onUseHint(active);
    setIsConfirming(false);
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
        role={flipped && !isConfirming ? "button" : undefined}
        tabIndex={flipped && !isConfirming ? 0 : -1}
        aria-label={flipped && !isConfirming ? "Flip to word" : undefined}
        onClick={() => {
          if (flipped) flipToFront();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && isConfirming) {
            flipToFront();
          } else if ((e.key === "Enter" || e.key === " ") && !isConfirming) {
            e.preventDefault();
            if (flipped) flipToFront();
          }
        }}
      >
        <div className="cardFace">
          {round.word}
        </div>

        <div className="cardFace cardBack">
          {active && <div className="hintBackLabel">{getHintLabel(active)}</div>}
          {isConfirming && active ? (
            <div className="hintConfirmation">
              <div className="hintConfirmationText">
                Are you sure you&apos;d like to use a hint?
              </div>
              <button
                type="button"
                className="hintConfirmBtn"
                onClick={confirmHint}
              >
                Yes, I&apos;m sure.
              </button>
            </div>
          ) : (
            <div className="cardBackText">{hintText}</div>
          )}
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
            className={`hintBtn hintSent ${used.sentence ? "used" : ""}`}
            onClick={() => reveal("sentence")}
            disabled={disableHints || hintsLocked}
            aria-label="Example Sentence"
          >
            <Pencil size={18} strokeWidth={2} />
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
        </div>
      </div>
    </div>
  );
}
