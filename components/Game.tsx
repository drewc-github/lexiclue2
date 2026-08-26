"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import WordCard from "./WordCard";
import Choices from "./Choices";
import { DailyGame, HintType } from "../lib/types";
import {
    createInitialProgress,
    restoreGameProgress,
    type RoundProgress,
} from "../lib/gameProgress";
import { MessageSquareText, Repeat, Pencil } from "lucide-react";


function calcPoints(isCorrect: boolean, used: RoundProgress["used"]) {
    if (!isCorrect) return 0;

    const hintCost =
        (used.pos ? 1 : 0) +
        (used.sentence ? 2 : 0) +
        (used.synonym ? 3 : 0);

    return Math.max(0, 10 - hintCost);
}

function getGradeData(percent: number) {
    if (percent == 100)
        return {
            letter: "A+",
            emoji: "🏆",
            message: "Summa cum laude! Outstanding lexical excellence.",
        };

    if (percent >= 93)
        return {
            letter: "A",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 90)
        return {
            letter: "A-",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 87)
        return {
            letter: "B+",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 83)
        return {
            letter: "B",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 80)
        return {
            letter: "B-",
            emoji: "📚",
            message: "Strong work. A scholar in the making.",
        };

    if (percent >= 77)
        return {
            letter: "C+",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 73)
        return {
            letter: "C",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 70)
        return {
            letter: "C-",
            emoji: "✏️",
            message: "Passing with promise. Keep studying.",
        };

    if (percent >= 67)
        return {
            letter: "D+",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 63)
        return {
            letter: "D",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 60)
        return {
            letter: "D-",
            emoji: "📝",
            message: "Credit earned. Vocabulary needs polish.",
        };

    return {
        letter: "F",
        emoji: "🚨",
        message: "Please see me after class.",
    };
}

export default function Game({ daily }: { daily: DailyGame }) {
    const totalRounds = daily.rounds.length;

    const [current, setCurrent] = useState(0);
    const [showResults, setShowResults] = useState(false);
    const [isSliding, setIsSliding] = useState(false);
    const [nextView, setNextView] = useState<number | "results" | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [shareStatus, setShareStatus] = useState("");
    const [gamePanelHeight, setGamePanelHeight] = useState<number | null>(null);
    const resultsPreviewRef = useRef<HTMLDivElement>(null);
    const progressStorageKey = `lexiclues-progress:${daily.contentKey}`;
    const [didHydrateProgress, setDidHydrateProgress] = useState(false);
    const [progress, setProgress] = useState<RoundProgress[]>(
        () => createInitialProgress(daily)
    );

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(progressStorageKey);
            const restored = restoreGameProgress(raw, daily);
            setProgress(restored.progress);
            setCurrent(restored.current);
            setShowResults(restored.showResults);
        } catch {
            // ignore bad local data
        } finally {
            setDidHydrateProgress(true);
        }
    }, [progressStorageKey, daily]);

    useEffect(() => {
        if (!didHydrateProgress) return;

        window.localStorage.setItem(
            progressStorageKey,
            JSON.stringify({
                current,
                showResults,
                progress: showResults
                    ? progress
                    : progress.map((round, roundIndex) =>
                        roundIndex === current
                            ? { ...round, selectedIndex: null, isCorrect: null }
                            : round
                    ),
            })
        );
    }, [current, didHydrateProgress, progress, progressStorageKey, showResults]);

    const currentRound = daily.rounds[current];
    const currentProgress = progress[current];

    const canGoNext = typeof currentProgress?.selectedIndex === "number";
    const SLIDE_MS = 340;

    function onUseHint(roundIdx: number, h: HintType) {
        setProgress((prev) => {
            const copy = [...prev];
            const p = copy[roundIdx];
            if (!p.used[h]) {
                copy[roundIdx] = { ...p, used: { ...p.used, [h]: true } };
            }
            return copy;
        });
    }

    function onSelectAnswer(index: number) {
        setProgress((prev) => {
            const copy = [...prev];
            const p = copy[current];
            const correct = index === currentRound.correctIndex;
            copy[current] = { ...p, selectedIndex: index, isCorrect: correct };
            return copy;
        });
    }

    function next() {
        if (!canGoNext || isSliding) return;

        const isLast = current >= totalRounds - 1;
        const incoming: number | "results" = isLast ? "results" : current + 1;

        setNextView(incoming);
        setIsSliding(true);

        window.setTimeout(() => {
            if (incoming === "results") {
                setIsSliding(false);
                setNextView(null);
                setShowResults(true);
            } else {
                setCurrent(incoming);

                // Keep the translated page visible until the first page has
                // rendered the same incoming round, then reset the track.
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        setIsSliding(false);
                        setNextView(null);
                    });
                });
            }
        }, SLIDE_MS);
    }

    function onHelpClick() {
        setShowHelp((v) => !v);
    }

    const scoreSummary = useMemo(() => {
        const perRound = progress.map((p, idx) => {
            const usedCount = Object.values(p.used).filter(Boolean).length;
            const isCorrect = p.isCorrect === true;

            const round = daily.rounds[idx];
            const correctDefinition = round.choices[round.correctIndex];
            const points = calcPoints(isCorrect, p.used);

            return {
                idx,
                word: round.word,
                pos: round.partOfSpeech ?? "",
                correctDefinition,
                usedCount,
                isCorrect,
                points,
            };
        });

        const total = Number(
            perRound.reduce((sum, r) => sum + r.points, 0).toFixed(1)
        );
        return { perRound, total };
    }, [progress, daily]);

    const gameOver = showResults || current >= totalRounds;
    const maxScore = totalRounds * 10;
    const percent = Math.round((scoreSummary.total / maxScore) * 100);
    const gradeData = getGradeData(percent);

    useLayoutEffect(() => {
        if (nextView !== "results" || !resultsPreviewRef.current) {
            setGamePanelHeight(null);
            return;
        }

        setGamePanelHeight(Math.max(668, resultsPreviewRef.current.scrollHeight));
    }, [nextView]);

    async function shareResults() {
        const resultGrid = scoreSummary.perRound
            .map((round) => {
                if (!round.isCorrect) return "⬛";
                return round.usedCount === 0 ? "🟩" : "🟨";
            })
            .join("");
        const hintCount = scoreSummary.perRound.reduce((sum, round) => sum + round.usedCount, 0);
        const shareText = [
            `Lexiclues ${daily.dateKey}`,
            `${scoreSummary.total}/${maxScore} points`,
            resultGrid,
            `${hintCount} hint${hintCount === 1 ? "" : "s"} used`,
        ].join("\n");
        const playUrl = new URL("/", window.location.href).toString();

        try {
            if (navigator.share) {
                await navigator.share({
                    title: "Lexiclues",
                    text: shareText,
                    url: playUrl,
                });
                setShareStatus("Shared!");
            } else {
                await navigator.clipboard.writeText(`${shareText}\n\nPlay Lexiclues: ${playUrl}`);
                setShareStatus("Results copied!");
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setShareStatus("Couldn’t share results.");
        }
    }

    function HowToCard() {
        return (
            <section className="panel howPanel">
                <div className="panelInner howPanelInner">
                    <div className="panelTop">
                        <div className="howHero">
                            <div className="howEyebrow">How to Play</div>
                            <div className="howText">
                                <b>Work through {totalRounds} words</b> each day and choose the definition that fits each one.
                                Some may look familiar and others might be completely new. But either way, you&apos;ll
                                finish with a sharper vocabulary.
                            </div>
                            <div className="howText">
                                <b>Need a clue?</b> Reveal the part of speech, an example sentence, or a synonym.
                                Stronger hints cost more points, so use them wisely. You&apos;ll confirm before any
                                points are deducted.
                            </div>
                        </div>
                    </div>

                    <div className="panelMid">
                        <div className="sectionLabel">Hints</div>

                        <div className="howHints">
                            <div className="howHintRow">
                                <div className="howHintIcon hintPos" aria-hidden="true">
                                    <MessageSquareText />
                                </div>
                                <div>
                                    <div className="howHintLabel">Part of Speech</div>
                                    <div className="howHintDesc">
                                        Check whether the word is a noun, verb, or adjective.
                                    </div>
                                </div>
                            </div>

                            <div className="howHintRow">
                                <div className="howHintIcon hintSent" aria-hidden="true">
                                    <Pencil />
                                </div>
                                <div>
                                    <div className="howHintLabel">Example Sentence</div>
                                    <div className="howHintDesc">
                                        See the word used in context before making your pick.
                                    </div>
                                </div>
                            </div>

                            <div className="howHintRow">
                                <div className="howHintIcon hintSyn" aria-hidden="true">
                                    <Repeat />
                                </div>
                                <div>
                                    <div className="howHintLabel">Synonym</div>
                                    <div className="howHintDesc">
                                        Get a similar word to help point you in the right direction.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="panelBottom">
                        <div className="sectionLabel">Scoring</div>

                        <div className="howHints">
                            <div className="howHintRow">
                                <div className="howHintIcon hintScore">
                                    ✅
                                </div>
                                <div className="howHintDesc">
                                    Every round starts at <b>10 points</b>.
                                </div>
                            </div>
                            <div className="howHintRow">
                                <div className="howHintIcon hintGlass">
                                    🔍
                                </div>
                                <div className="howHintDesc">
                                    Part of speech costs <b>1 point</b>, example sentence costs <b>2 points</b>,
                                    and a synonym costs <b>3 points</b>.
                                </div>
                            </div>

                            <div className="howHintRow">
                                <div className="howHintIcon hintWrong">
                                    ❌
                                </div>
                                <div className="howHintDesc">
                                    A wrong answer scores <b>0</b> for that round.
                                </div>
                            </div>
                        </div>
                        <div className="howFooter">Tap anywhere to flip over</div>
                    </div>
                </div>
            </section>
        );
    }

    if (gameOver) {
        return (
            <main className="page">
                <div className="shell">
                    <header className="topbar">
                        <div>
                            <div className="brand">Lexiclues</div>
                            <div className="subtitle">Daily word game</div>
                        </div>

                        <div className="roundMeta">
                            <button
                                type="button"
                                className="helpBtn"
                                aria-label="How to play"
                                onClick={onHelpClick}
                            >
                                How to Play
                            </button>
                            <div className="roundFrac">Results</div>
                        </div>
                    </header>

                    <section className="panelFlip">
                        <div className={`panelInner3d ${showHelp ? "flipped" : ""}`}>
                            <div className="panelFace panelFront">
                                <section className="panel">
                                    <div className="panelInner">
                                        <div className="reportCard reportHeader">
                                            <div className="reportNote">{gradeData.message}</div>
                                            <div className="reportGrade">{gradeData.letter}</div>
                                            <div className="reportMeta">
                                                <span className="reportPercent">
                                                    {percent}% {gradeData.emoji}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="reportCard">
                                            <div className="reportTitle">Round Breakdown</div>

                                            {scoreSummary.perRound.map((r) => (
                                                <div key={r.idx} className="breakdownRow">
                                                    <div className="breakdownLeft">
                                                        <div className="breakdownMark">
                                                            {r.isCorrect ? "✅" : "❌"}
                                                        </div>

                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="breakdownWordRow">
                                                                <span className="breakdownWord">{r.word}</span>

                                                                {r.usedCount > 0 && (
                                                                    <span className="breakdownHints">
                                                                        <span className="hintDot">·</span>
                                                                        {r.usedCount} hint{r.usedCount > 1 ? "s" : ""} used
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="breakdownDefLine">
                                                                <span className="breakdownPos">{r.pos}</span>
                                                                <span className="breakdownDefText">
                                                                    {r.correctDefinition}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="breakdownPts">{r.points}/10</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="reportCard reportFooter">
                                            <div className="reportFooterLabel">Final Score</div>
                                            <div className="reportFooterScore">{scoreSummary.total}</div>
                                            <div className="reportFooterOutOf">out of {maxScore}</div>
                                        </div>

                                        <div>
                                            <button
                                                type="button"
                                                className="primaryBtn shareResultsBtn"
                                                onClick={shareResults}
                                            >
                                                Share Results
                                            </button>
                                            {shareStatus && (
                                                <div className="shareStatus" role="status" aria-live="polite">
                                                    {shareStatus}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div
                                className="panelFace panelBack"
                                role="button"
                                tabIndex={0}
                                aria-label="Close instructions"
                                onClick={() => setShowHelp(false)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") setShowHelp(false);
                                }}
                            >
                                <HowToCard />
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        );
    }

    return (
        <main className="page">
            <div className="shell">
                <header className="topbar">
                    <div>
                        <div className="brand">Lexiclues</div>
                        <div className="subtitle">Daily word game</div>
                    </div>

                    <div className="roundMeta">
                        <button
                            type="button"
                            className="helpBtn"
                            aria-label="How to play"
                            onClick={onHelpClick}
                        >
                            How to Play
                        </button>

                        <div className="roundFrac">
                            {current + 1}/{totalRounds}
                        </div>
                    </div>
                </header>

                <section className="panelFlip">
                    <div className={`panelInner3d ${showHelp ? "flipped" : ""}`}>
                        <div className="panelFace panelFront">
                            <section
                                className={`panel gamePanel ${isSliding ? "panelAnimating" : ""}`}
                                style={gamePanelHeight ? { height: `${gamePanelHeight}px` } : undefined}
                            >
                                <div className="carouselViewport">
                                    <div className={`carouselTrack ${isSliding ? "slideLeft" : ""}`}>
                                        <div className="carouselPage" key={`current-${current}`}>
                                            <div className="panelInner">
                                                <div className="panelTop">
                                                    <WordCard
                                                        key={current}
                                                        round={currentRound}
                                                        used={currentProgress.used}
                                                        onUseHint={(h) => onUseHint(current, h)}
                                                        disableHints={isSliding}
                                                    />
                                                </div>

                                                <div className="panelMid">
                                                    <div className="sectionLabel">Choose the best match</div>
                                                    <Choices
                                                        key={current}
                                                        choices={currentRound.choices}
                                                        correctIndex={currentRound.correctIndex}
                                                        selectedIndex={currentProgress.selectedIndex}
                                                        onSelect={onSelectAnswer}
                                                        revealCorrectness={false}
                                                        disabled={isSliding}
                                                    />
                                                </div>

                                                <div className="panelBottom gameActions">
                                                    <button
                                                        className={`primaryBtn ${canGoNext ? "" : "disabled"} ${current === totalRounds - 1 ? "finish" : ""
                                                            }`}
                                                        onClick={next}
                                                        disabled={!canGoNext || isSliding}
                                                    >
                                                        {current === totalRounds - 1 ? "Submit" : "Next"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="carouselPage">
                                            {nextView === null ? (
                                                <div className="panelInner" />
                                            ) : nextView === "results" ? (
                                                <div className="panelInner" ref={resultsPreviewRef}>
                                                    <div className="reportCard reportHeader">
                                                        <div className="reportNote">{gradeData.message}</div>
                                                        <div className="reportGrade">{gradeData.letter}</div>
                                                        <div className="reportMeta">
                                                            <span className="reportPercent">
                                                                {percent}% {gradeData.emoji}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="reportCard">
                                                        <div className="reportTitle">Round Breakdown</div>
                                                        {scoreSummary.perRound.map((r) => (
                                                            <div key={r.idx} className="breakdownRow">
                                                                <div className="breakdownLeft">
                                                                    <div className="breakdownMark">
                                                                        {r.isCorrect ? "✅" : "❌"}
                                                                    </div>
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div className="breakdownWordRow">
                                                                            <span className="breakdownWord">{r.word}</span>
                                                                            {r.usedCount > 0 && (
                                                                                <span className="breakdownHints">
                                                                                    <span className="hintDot">·</span>
                                                                                    {r.usedCount} hint{r.usedCount > 1 ? "s" : ""} used
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="breakdownDefLine">
                                                                            <span className="breakdownPos">{r.pos}</span>
                                                                            <span className="breakdownDefText">
                                                                                {r.correctDefinition}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="breakdownPts">{r.points}/10</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="reportCard reportFooter">
                                                        <div className="reportFooterLabel">Final Score</div>
                                                        <div className="reportFooterScore">{scoreSummary.total}</div>
                                                        <div className="reportFooterOutOf">out of {maxScore}</div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="primaryBtn shareResultsBtn"
                                                        aria-hidden="true"
                                                        disabled
                                                    >
                                                        Share Results
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="panelInner">
                                                    <div className="panelTop">
                                                        <WordCard
                                                            key={nextView}
                                                            round={daily.rounds[nextView]}
                                                            used={progress[nextView].used}
                                                            onUseHint={() => { }}
                                                            disableHints={false}
                                                        />
                                                    </div>

                                                    <div className="panelMid">
                                                        <div className="sectionLabel">Choose the best match</div>
                                                        <Choices
                                                            key={nextView}
                                                            choices={daily.rounds[nextView].choices}
                                                            correctIndex={daily.rounds[nextView].correctIndex}
                                                            selectedIndex={progress[nextView].selectedIndex}
                                                            onSelect={() => { }}
                                                            revealCorrectness={false}
                                                            disabled
                                                        />
                                                    </div>

                                                    <div className="panelBottom gameActions">
                                                        <button
                                                            className={`primaryBtn disabled ${nextView === totalRounds - 1 ? "finish" : ""}`}
                                                            type="button"
                                                            onClick={() => { }}
                                                            aria-hidden="true"
                                                            disabled
                                                        >
                                                            {nextView === totalRounds - 1 ? "Submit" : "Next"}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div
                            className="panelFace panelBack"
                            role="button"
                            tabIndex={0}
                            aria-label="Close instructions"
                            onClick={() => setShowHelp(false)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") setShowHelp(false);
                            }}
                        >
                            <HowToCard />
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
