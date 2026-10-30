import clsx from "clsx";
import { useCallback, useEffect, useReducer, useState } from "react";
import { judge, pickRounds, revealMap } from "../../src/atlas";
import { Backdrop } from "./components/Backdrop";
import { Header } from "./components/Header";
import { Intro } from "./components/Intro";
import { MapPanel } from "./components/MapPanel";
import { PicturePanel } from "./components/PicturePanel";
import { ResultCard } from "./components/ResultCard";
import { Summary } from "./components/Summary";
import { useData } from "./data";
import { initial, reduce, ROUNDS, total } from "./game";

export function App() {
  const { data, error } = useData();
  const [s, dispatch] = useReducer(reduce, initial);
  const [whole, setWhole] = useState(false);
  const round = s.rounds[s.at];
  const played = s.revealed ? s.results[s.results.length - 1] : undefined;

  const start = useCallback(() => data && dispatch({ type: "start", rounds: pickRounds(data.rounds, ROUNDS) }), [data]);
  const guess = useCallback(() => {
    if (!data || !round || !s.guess || s.revealed) return;
    const atlas = data.atlases.get(s.guess.map)!,
      home = data.atlases.get(round.map)!;
    dispatch({
      type: "reveal",
      result: judge(atlas, round, s.guess),
      view: { map: round.map, ui: revealMap(home, round, s.guess) },
    });
  }, [data, round, s.guess, s.revealed]);
  const next = useCallback(() => dispatch({ type: "next" }), []);

  // Enter or Space: guess, then the next round
  useEffect(() => {
    if (s.phase !== "play") return;
    const key = (e: KeyboardEvent) => {
      // F shows the picture whole, Esc closes it, nothing else while it is open
      if (e.key === "Escape") return setWhole(false);
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) return setWhole((w) => !w);
      if (whole || (e.key !== "Enter" && e.key !== " ")) return;
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      if (s.revealed) next();
      else guess();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [s.phase, s.revealed, whole, guess, next]);

  // the next picture fetched ahead
  useEffect(() => {
    const ahead = s.rounds[s.at + 1];
    if (ahead) new Image().src = `pictures/${ahead.id}.webp`;
  }, [s.rounds, s.at]);

  return (
    <div className="flex h-full flex-col" inert={whole}>
      {s.phase === "play" && <Header rounds={s.rounds.length} at={s.at} results={s.results} total={total(s)} />}
      <main className={clsx("relative min-h-0 flex-1 overflow-auto", s.phase === "play" && "lg:overflow-hidden")}>
        {error && <p className="p-8 text-center text-truth">{error}</p>}
        <Backdrop id={s.phase === "intro" ? data?.cover : round?.id} />
        {s.phase === "intro" && <Intro onPlay={start} ready={!!data} />}
        {s.phase === "summary" && <Summary results={s.results} onAgain={start} />}
        {s.phase === "play" && data && round && (
          <div className="flex flex-col gap-5 p-4 sm:p-6 lg:h-full lg:flex-row lg:gap-6 lg:p-5">
            <div className="min-w-0 lg:flex-1">
              <PicturePanel id={round.id} round={s.at + 1} rounds={s.rounds.length} whole={whole} onWhole={setWhole} />
            </div>
            {/* the map: under the picture on a narrow screen, its own column on a wide
                one, growing over the picture on a hover and for the reveal */}
            <div className="relative lg:w-[420px] lg:shrink-0 2xl:w-[520px]">
              <div
                className={clsx(
                  "flex min-w-0 flex-col gap-3 lg:absolute lg:top-1/2 lg:right-0 lg:z-10 lg:-translate-y-1/2 lg:rounded-[5px] lg:border lg:border-gold-700/50 lg:bg-ink-950/85 lg:p-3 lg:shadow-[0_0_0_1px_#000,0_24px_60px_-10px_rgb(0_0_0/0.9)] lg:backdrop-blur-md lg:transition-[width] lg:duration-300 lg:ease-out",
                  s.revealed
                    ? "lg:w-[min(1000px,calc(100vw-40px),calc((100dvh-300px)*1.5))]"
                    : "lg:w-[420px] lg:focus-within:w-[min(760px,calc(100vw-40px),calc((100dvh-300px)*1.5))] lg:hover:w-[min(760px,calc(100vw-40px),calc((100dvh-300px)*1.5))] 2xl:w-[520px]",
                )}
              >
                <MapPanel
                  key={s.at}
                  atlases={data.atlases}
                  view={s.view}
                  onView={(view) => dispatch({ type: "view", view })}
                  guess={s.guess}
                  onPlace={(g) => dispatch({ type: "place", guess: g })}
                  truth={s.revealed ? round : null}
                />
                <div className="flex min-h-[64px] flex-col items-stretch gap-3 px-1 sm:flex-row sm:items-center sm:gap-4">
                  {played ? (
                    <ResultCard
                      round={played.round}
                      result={played.result}
                      continent={data.atlases.get(round.map)!.name}
                    />
                  ) : (
                    <p className="flex-1 text-sm text-parch-300/70">
                      {s.view.ui == null
                        ? "Open a zone on the map."
                        : s.guess
                          ? "Happy with it? Guess."
                          : "Click where you think this is."}
                    </p>
                  )}
                  {s.revealed ? (
                    <button className="btn-red shrink-0" onClick={next}>
                      {s.at + 1 < s.rounds.length ? "Next round" : "The summary"}
                    </button>
                  ) : (
                    <button className="btn-red shrink-0" onClick={guess} disabled={!s.guess}>
                      Guess
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
