import { Compass, Eye, MousePointerClick } from "lucide-react";
import type { ReactNode } from "react";

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-parch-700/50 bg-parch-300/40 text-parch-700">
        {icon}
      </span>
      <p>
        <b className="font-display text-parch-900">{title}</b> {children}
      </p>
    </li>
  );
}

// the first page: what the game is, how a round goes
export function Intro({ onPlay, ready }: { onPlay: () => void; ready: boolean }) {
  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)] place-items-center p-4 sm:p-8">
      <section className="parchment w-full max-w-lg animate-rise px-6 py-8 sm:px-10">
        <h2 className="text-center font-display text-3xl font-black tracking-wide text-parch-900 sm:text-4xl">
          Where is this?
        </h2>
        <p className="mt-3 text-center text-[15px] leading-relaxed text-parch-700">
          Five places from the two continents, each pictured from the ground. Find them on the map.
        </p>
        <div className="rule text-parch-700/50" />
        <ol className="flex flex-col gap-3 text-[15px] text-parch-900/90">
          <Step icon={<Eye size={16} />} title="Look">
            at the picture. Every one shows a place with a name.
          </Step>
          <Step icon={<Compass size={16} />} title="Open">
            a zone on the continent's map.
          </Step>
          <Step icon={<MousePointerClick size={16} />} title="Click">
            where you think it was, then Guess.
          </Step>
        </ol>
        <p className="mt-5 text-center text-xs text-parch-700">
          Up to 5,000 points for the distance, 500 more for the right zone and 500 for the right subzone.
        </p>
        <div className="mt-6 flex justify-center">
          <button className="btn-red px-10 py-3 text-base" onClick={onPlay} disabled={!ready} autoFocus>
            {ready ? "Begin" : "Loading"}
          </button>
        </div>
      </section>
    </div>
  );
}
