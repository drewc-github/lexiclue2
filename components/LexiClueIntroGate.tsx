"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Game from "./Game";
import type { DailyGame } from "../lib/types";

const STORAGE_KEY = "lexiclues_intro_seen_this_session";
const subscribe = () => () => {};

export default function LexiClueIntroGate({ daily }: { daily: DailyGame }) {
    const isReady = useSyncExternalStore(subscribe, () => true, () => false);
    const [startedHere, setStartedHere] = useState(false);

    const showIntro =
        isReady &&
        !startedHere &&
        window.sessionStorage.getItem(STORAGE_KEY) !== "true";

    function handlePlay() {
        window.sessionStorage.setItem(STORAGE_KEY, "true");
        setStartedHere(true);
    }

    if (!isReady) return null;

    if (showIntro) {
        return (
            <main className="introPage">
                <div className="introShell">
                    <Image
                        src="/lexiclues-logo.svg"
                        alt="Lexiclues logo"
                        className="introLogo"
                        width={220}
                        height={220}
                        priority
                    />

                    <h1 className="introTitle">Lexiclues</h1>
                    <p className="introTagline">Learn <b>5</b> new words every day.</p>

                    <button type="button" className="introPlayBtn" onClick={handlePlay}>
                        Play
                    </button>

                    <div className="introCredit">Created by <b><a href="mailto:drewjc44@gmail.com">Drew Corsaro</a></b></div>
                </div>
            </main>
        );
    }

    return <Game daily={daily} />;
}