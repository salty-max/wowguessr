import clsx from "clsx";
import { ROUND_MAX } from "../../../src/atlas";
import type { Played } from "../game";
import { CountUp } from "./CountUp";

// a round's pip: empty ahead, glowing at hand, filled by its score once played
function Pip({ played, current }: { played?: Played; current: boolean }) {
  const share = played ? played.result.points / ROUND_MAX : 0;
  const colour =
    share >= 0.75 ? "bg-gold-300" : share >= 0.4 ? "bg-gold-600" : share > 0 ? "bg-[#a0432b]" : "bg-ink-600";
  return (
    <li
      title={played ? `${played.round.name}: ${played.result.points.toLocaleString("en-US")}` : undefined}
      className={clsx(
        "size-3 rotate-45 border transition-all duration-500",
        played ? [colour, "border-black shadow-[0_0_6px_rgb(0_0_0/0.8)]"] : "border-gold-600 bg-transparent",
        current && "scale-125 border-gold-300 shadow-[0_0_10px_var(--color-gold-400)]",
      )}
    />
  );
}

// the bar over a game: the title, a pip a round, the score
export function Header({
  rounds,
  at,
  results,
  total,
}: {
  rounds: number;
  at: number;
  results: Played[];
  total: number;
}) {
  return (
    <header className="relative z-20 flex items-center justify-between gap-4 border-b border-gold-700/60 bg-gradient-to-b from-ink-800 to-ink-900 px-4 py-2.5 shadow-[0_1px_0_#000,0_8px_24px_rgb(0_0_0/0.6)] sm:px-6">
      <h1 className="gold-text font-display text-base font-black tracking-wider whitespace-nowrap sm:text-2xl">
        Where is this?
      </h1>
      <ol className="flex items-center gap-2.5 sm:gap-4" aria-label="Rounds">
        {Array.from({ length: rounds }, (_, i) => (
          <Pip key={i} played={results[i]} current={i === at && !results[i]} />
        ))}
      </ol>
      <div className="flex items-baseline gap-2">
        <span className="hidden font-display text-[11px] tracking-[0.2em] text-gold-600 uppercase sm:inline">
          Score
        </span>
        <b className="font-display text-xl font-bold text-gold-200 tabular-nums sm:text-2xl">
          <CountUp value={total} />
        </b>
      </div>
    </header>
  );
}
