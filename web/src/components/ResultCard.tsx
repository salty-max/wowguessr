import clsx from "clsx";
import { FULL, type Result, ROUND_MAX, type Round, SUBZONE_BONUS, ZONE_BONUS } from "../../../src/atlas";
import { CountUp } from "./CountUp";

const fmt = (n: number) => n.toLocaleString("en-US");

function Chip({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={clsx(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        on ? "border-[#4f8a3a] bg-[#1d3315] text-[#a8e08a]" : "border-ink-500 text-parch-300/40 line-through",
      )}
    >
      {children}
    </span>
  );
}

// a round's outcome: the place, how far, the points and what made them
export function ResultCard({ round, result, continent }: { round: Round; result: Result; continent: string }) {
  const place = round.zoneName && round.zoneName !== round.name ? round.zoneName : "";
  return (
    <div className="flex min-w-0 flex-1 animate-rise flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight font-bold text-wow">{round.name}</p>
          <p className="truncate text-sm text-parch-300/80">
            {place && (
              <>
                {place} {"\u00b7"}{" "}
              </>
            )}
            {result.yards == null
              ? `wrong continent, this is in ${continent}`
              : `${fmt(Math.round(result.yards))} yards away`}
          </p>
        </div>
        <p className="shrink-0 font-display text-2xl font-black text-gold-200 tabular-nums">
          +<CountUp value={result.points} from={0} />
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-black bg-ink-950 shadow-[inset_0_1px_3px_#000]">
        <div
          className="h-full origin-left animate-grow rounded-full bg-gradient-to-r from-gold-700 via-gold-500 to-gold-300"
          style={{ width: `${(result.points / ROUND_MAX) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={result.distance > 0}>{`Distance ${fmt(result.distance)} / ${fmt(FULL)}`}</Chip>
        <Chip on={result.zone}>{`Zone +${ZONE_BONUS}`}</Chip>
        <Chip on={result.subzone}>{`Subzone +${SUBZONE_BONUS}`}</Chip>
      </div>
    </div>
  );
}
