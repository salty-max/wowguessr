import { RotateCcw } from "lucide-react";
import { rank, ROUND_MAX } from "../../../src/atlas";
import { picture } from "../data";
import type { Played } from "../game";
import { CountUp } from "./CountUp";

const fmt = (n: number) => n.toLocaleString("en-US");

// the game's end: the total, a title for it, each round
export function Summary({ results, onAgain }: { results: Played[]; onAgain: () => void }) {
  const total = results.reduce((s, p) => s + p.result.points, 0);
  return (
    <div className="grid min-h-full place-items-center p-4 sm:p-8">
      <section className="parchment w-full max-w-2xl animate-rise px-5 py-7 sm:px-9">
        <p className="text-center font-display text-xs tracking-[0.3em] text-parch-700 uppercase">Journey's end</p>
        <h2 className="mt-1 text-center font-display text-5xl font-black text-parch-900 tabular-nums">
          <CountUp value={total} ms={1200} from={0} />
        </h2>
        <p className="text-center text-sm text-parch-700">of {fmt(ROUND_MAX * results.length)} points</p>
        <p className="mt-2 text-center font-display text-xl font-bold text-[#7a2a12]">{rank(total, results.length)}</p>
        <div className="rule text-parch-700/50" />
        <ol className="flex flex-col gap-2.5">
          {results.map(({ round, result }, i) => (
            <li
              key={round.id}
              className="flex items-center gap-3 rounded-[3px] bg-parch-100/60 p-2 shadow-[0_0_0_1px_rgb(107_79_42/0.25)]"
            >
              <span className="w-4 text-center font-display text-sm font-bold text-parch-700">{i + 1}</span>
              <img
                src={picture(round.id)}
                alt=""
                className="aspect-video w-24 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_#000] sm:w-32"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-bold text-parch-900">{round.name}</p>
                <p className="truncate text-xs text-parch-700">
                  {round.zoneName && round.zoneName !== round.name && (
                    <>
                      {round.zoneName} {"\u00b7"}{" "}
                    </>
                  )}
                  {result.yards == null ? "other continent" : `${fmt(Math.round(result.yards))} yards`}
                  {result.zone && " \u00b7 zone"}
                  {result.subzone && " \u00b7 subzone"}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-parch-300/60">
                  <div
                    className="h-full origin-left animate-grow rounded-full bg-gradient-to-r from-[#7a2a12] to-gold-600"
                    style={{ width: `${(result.points / ROUND_MAX) * 100}%` }}
                  />
                </div>
              </div>
              <p className="w-16 shrink-0 text-right font-display text-lg font-bold text-parch-900 tabular-nums">
                {fmt(result.points)}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-7 flex justify-center">
          <button className="btn-red px-8 py-3" onClick={onAgain} autoFocus>
            <RotateCcw size={16} /> Play again
          </button>
        </div>
      </section>
    </div>
  );
}
