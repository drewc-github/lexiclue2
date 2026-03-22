"use client";

import { useEffect, useMemo, useState } from "react";
import WordCard from "./WordCard";
import Choices from "./Choices";
import { DailyGame, HintType } from "../lib/types";
import { MessageSquareText, Repeat, Pencil } from "lucide-react";


type RoundProgress = {
    selectedIndex: number | null;
    isCorrect: boolean | null;
    used: Record<HintType, boolean>;
};

function calcPoints(isCorrect: boolean, usedCount: number) {
    if (!isCorrect) return 0;
    return Math.max(0, 5 - usedCount * 0.5);
}

function getGradeData(percent: number) {
    if (percent >= 95)
        return {
            letter: "A+",
            emoji: "🏆",
            message: "Summa cum laude! Outstanding lexical excellence.",
        };

    if (percent >= 90)
        return {
            letter: "A",
            emoji: "🎓",
            message: "Dean’s list. Words bow to you.",
        };

    if (percent >= 80)
        return {
            letter: "B",
            emoji: "📚",
            message: "Strong work. A scholar in the making.",
        };

    if (percent >= 70)
        return {
            letter: "C",
            emoji: "✏️",
            message: "Passing with promise. Keep studying.",
        };

    if (percent >= 60)
        return {
            letter: "D",
            emoji: "📝",
            message: "Credit earned. Vocabulary needs polish.",
        };

    return {
        letter: "F",
        emoji: "🚨",
        message: "Please see me after class.",
    };
}

export default function Game({
    daily,
    autoFlipHelpAfterMs = 0,
}: {
    daily: DailyGame;
    autoFlipHelpAfterMs?: number;
}) {
    const totalRounds = daily.rounds.length;

    const [current, setCurrent] = useState(0);
    const [showResults, setShowResults] = useState(false);
    const [isSliding, setIsSliding] = useState(false);
    const [nextView, setNextView] = useState<number | "results" | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const progressStorageKey = `lexiclues-progress:${daily.dateKey}`;
    const [didHydrateProgress, setDidHydrateProgress] = useState(false);
    const [progress, setProgress] = useState<RoundProgress[]>(
        () =>
            daily.rounds.map(() => ({
                selectedIndex: null,
                isCorrect: null,
                used: { pos: false, synonym: false, sentence: false },
            })) as RoundProgress[]
    );

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(progressStorageKey);
            if (!raw) {
                setDidHydrateProgress(true);
                return;
            }

            const saved = JSON.parse(raw) as {
                current?: number;
                showResults?: boolean;
                progress?: RoundProgress[];
            };

            if (Array.isArray(saved.progress) && saved.progress.length === daily.rounds.length) {
                const repaired = saved.progress.map((p, idx) => {
                    const selectedIndex =
                        typeof p?.selectedIndex === "number" ? p.selectedIndex : null;

                    return {
                        selectedIndex,
                        isCorrect:
                            selectedIndex === null
                                ? null
                                : selectedIndex === daily.rounds[idx].correctIndex,
                        used: {
                            pos: !!p?.used?.pos,
                            synonym: !!p?.used?.synonym,
                            sentence: !!p?.used?.sentence,
                        },
                    };
                });

                setProgress(repaired);
            }

            if (typeof saved.current === "number") {
                setCurrent(saved.current);
            }
            if (typeof saved.showResults === "boolean") {
                setShowResults(saved.showResults);
            }
        } catch {
            // ignore bad local data
        } finally {
            setDidHydrateProgress(true);
        }
    }, [progressStorageKey, daily.rounds.length]);

    useEffect(() => {
        if (!didHydrateProgress) return;

        window.localStorage.setItem(
            progressStorageKey,
            JSON.stringify({
                current,
                showResults,
                progress,
            })
        )
    })

    useEffect(() => {
        if (autoFlipHelpAfterMs <= 0) return;

        setShowHelp(false);

        const timer = window.setTimeout(() => {
            setShowHelp(true);
        }, autoFlipHelpAfterMs);

        return () => window.clearTimeout(timer);
    }, [autoFlipHelpAfterMs]);

    const currentRound = daily.rounds[current];
    const currentProgress = progress[current];

    const canGoNext = currentProgress?.selectedIndex !== null;
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
            setIsSliding(false);
            setNextView(null);

            if (incoming === "results") {
                setShowResults(true);
            } else {
                setCurrent(incoming);
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
            const points = calcPoints(isCorrect, usedCount);

            return {
                idx,
                word: round.word,
                pos: (round as any).partOfSpeech ?? "",
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
    const maxScore = totalRounds * 5;
    const percent = Math.round((scoreSummary.total / maxScore) * 100);
    const gradeData = getGradeData(percent);

    function HowToCard() {
        return (
            <section className="panel howPanel">
                <div className="panelInner howPanelInner">
                    <div className="panelTop">
                        <div className="howHero">
                            <div className="howEyebrow">How to Play</div>
                            <div className="howText">
                                Each day, <b>Lexiclues</b> will give you <b>{totalRounds} </b>new words to work
                                through. Your goal is to choose the definition that fits.
                                Some words you've seen, some you've never heard of, but either way
                                you'll be improving your vocab.
                            </div>
                            <div className="howText">
                                If stumped, you can use hints before locking in
                                your answer. The fewer hints you use, the more points you keep.
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
                                        See whether the word is a noun, verb, adjective, and more.
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
                                    Every round starts at <b>5 points</b>.
                                </div>
                            </div>
                            <div className="howHintRow">
                                <div className="howHintIcon hintGlass">
                                    🔍
                                </div>
                                <div className="howHintDesc">
                                    Each hint you use costs <b>½ point</b>.
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
                                ?
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

                                                    <div className="breakdownPts">{r.points}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="reportCard reportFooter">
                                            <div className="reportFooterLabel">Final Score</div>
                                            <div className="reportFooterScore">{scoreSummary.total}</div>
                                            <div className="reportFooterOutOf">out of {maxScore}</div>
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
                            ?
                        </button>

                        <div className="roundFrac">
                            {current + 1} / {totalRounds}
                        </div>
                    </div>
                </header>

                <section className="panelFlip">
                    <div className={`panelInner3d ${showHelp ? "flipped" : ""}`}>
                        <div className="panelFace panelFront">
                            <section className={`panel ${isSliding ? "panelAnimating" : ""}`}>
                                <div className="carouselViewport">
                                    <div className={`carouselTrack ${isSliding ? "slideLeft" : ""}`}>
                                        <div className="carouselPage">
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
                                                        choices={currentRound.choices}
                                                        correctIndex={currentRound.correctIndex}
                                                        selectedIndex={currentProgress.selectedIndex}
                                                        onSelect={onSelectAnswer}
                                                        revealCorrectness={false}
                                                    />
                                                </div>

                                                <div className="panelBottom">
                                                    <button
                                                        className={`primaryBtn ${canGoNext ? "" : "disabled"} ${current === totalRounds - 1 ? "finish" : ""
                                                            }`}
                                                        onClick={next}
                                                        disabled={!canGoNext || isSliding}
                                                    >
                                                        {current === totalRounds - 1 ? "Finish" : "Next"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="carouselPage">
                                            {nextView === null ? (
                                                <div className="panelInner" />
                                            ) : nextView === "results" ? (
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
                                                                    <div className="breakdownMark">•</div>
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div className="breakdownWord">{r.word}</div>
                                                                        <div className="breakdownDef">{r.correctDefinition}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="breakdownPts">{r.points}</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="reportCard reportFooter">
                                                        <div className="reportFooterLabel">Final Score</div>
                                                        <div className="reportFooterScore">{scoreSummary.total}</div>
                                                        <div className="reportFooterOutOf">out of {maxScore}</div>
                                                    </div>
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
                                                            choices={daily.rounds[nextView].choices}
                                                            correctIndex={daily.rounds[nextView].correctIndex}
                                                            selectedIndex={progress[nextView].selectedIndex}
                                                            onSelect={() => { }}
                                                            revealCorrectness={false}
                                                        />
                                                    </div>

                                                    <div className="panelBottom">
                                                        <button
                                                            className="primaryBtn"
                                                            type="button"
                                                            onClick={() => { }}
                                                            aria-hidden="true"
                                                        >
                                                            Next
                                                        </button>
                                                        <div className="fineprint"> </div>
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