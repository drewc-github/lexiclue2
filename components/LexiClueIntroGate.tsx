"use client";

import { useEffect, useState } from "react";
import Game from "./Game";
import type { DailyGame } from "../lib/types";

const STORAGE_KEY = "lexiclues_intro_seen";

export default function LexiClueIntroGate({ daily }: { daily: DailyGame }) {
    const [isReady, setIsReady] = useState(false);
    const [showIntro, setShowIntro] = useState(false);
    const [shouldAutoFlip, setShouldAutoFlip] = useState(false);

    useEffect(() => {
        const hasSeenIntro = window.localStorage.getItem(STORAGE_KEY) === "true";
        setShowIntro(!hasSeenIntro);
        setIsReady(true);
    }, []);

    function handlePlay() {
        window.localStorage.setItem(STORAGE_KEY, "true");
        setShouldAutoFlip(true);
        setShowIntro(false);
    }

    if (!isReady) return null;

    if (showIntro) {
        return (
            <main className="introPage">
                <div className="introShell">
                    <img
                        src="/lexiclues-logo.svg"
                        alt="Lexiclues logo"
                        className="introLogo"
                    />

                    <h1 className="introTitle">Lexiclues</h1>
                    <p className="introTagline">Learn <b>5</b> new words everyday.</p>

                    <button type="button" className="introPlayBtn" onClick={handlePlay}>
                        Play
                    </button>

                    <div className="introCredit">Created by Drew Corsaro</div>
                </div>
            </main>
        );
    }

    return (
        <Game
            daily={daily}
            autoFlipHelpAfterMs={shouldAutoFlip ? 500 : 0}
        />
    );
}