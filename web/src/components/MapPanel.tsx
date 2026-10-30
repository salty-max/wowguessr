import clsx from "clsx";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { type PointerEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  areaAt,
  type Atlas,
  type Frame as MapFrame,
  type Guess,
  onFrame,
  parentOf,
  type Round,
  toPixel,
  toWorld,
  zoneUnder,
} from "../../../src/atlas";
import { mapPicture } from "../data";
import type { View } from "../game";
import { usePanZoom } from "../hooks/usePanZoom";
import { Frame } from "./Frame";

type Props = {
  atlases: Map<number, Atlas>;
  view: View;
  onView: (v: View) => void;
  guess: Guess | null;
  onPlace: (g: Guess) => void;
  truth: Round | null; // shown once revealed
};

// the area (and its zone) under a point, as the game's map names it
function areaLine(a: Atlas, x: number, y: number) {
  const area = areaAt(a.areas, x, y),
    n = a.names[area];
  if (!n) return "";
  const zone = a.names[n.zone]?.name;
  return n.zone === area || !zone ? n.name : `${n.name}, ${zone}`;
}

// The map: a continent's, on which a click opens a zone's, on which a click
// places the guess. Wheel, pinch and buttons zoom, a drag pans.
export function MapPanel({ atlases, view, onView, guess, onPlace, truth }: Props) {
  const atlas = atlases.get(view.map)!;
  const zone = view.ui == null ? null : atlas.zones.find((z) => z.ui === view.ui)!;
  const frame: MapFrame = zone?.frame ?? atlas.frame;
  const { box, t, zoomAt, panBy, show } = usePanZoom(frame, `${view.map}:${view.ui}`);
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);

  // after a reveal: the guess and the truth framed together
  useEffect(() => {
    if (!truth) return;
    const points = [truth, guess].filter(
      (p): p is Round | Guess => !!p && p.map === view.map && onFrame(frame, p.x, p.y),
    );
    show(points.map((p) => toPixel(frame, p.x, p.y)));
  }, [truth, guess, view.map, frame, show]);

  // the pointer: on the box, on the picture, in the world
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    const vx = e.clientX - r.left,
      vy = e.clientY - r.top,
      px = (vx - t.tx) / t.scale,
      py = (vy - t.ty) / t.scale;
    return { vx, vy, px, py, ...toWorld(frame, px, py) };
  };

  // the wheel zooms about the pointer (a listener of its own: React's is
  // passive, and the page would scroll under the map)
  const wheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    const at = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), at.vx, at.vy);
  });
  useEffect(() => {
    const el = box.current!,
      on = (e: WheelEvent) => wheel(e);
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [box]);

  // a drag pans, a pinch zooms, a press that hardly moved opens a zone or places the guess
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0),
    pinch = useRef(0);
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const move = (e: PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) {
      const at = local(e);
      const text = zone ? areaLine(atlas, at.x, at.y) : (zoneUnder(atlas, at.x, at.y)?.name ?? "");
      setHover(text ? { text, x: at.vx, y: at.vy } : null);
      return;
    }
    if (pointers.current.size === 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      if (pinch.current) zoomAt(d / pinch.current, mid.vx, mid.vy);
      pinch.current = d;
      moved.current = Infinity;
      return;
    }
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX;
    p.y = e.clientY;
    panBy(dx, dy);
  };
  const up = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size < 2) pinch.current = 0;
    if (pointers.current.size || moved.current >= 6 || e.type !== "pointerup") return;
    const at = local(e);
    if (at.px < 0 || at.py < 0 || at.px > frame.width || at.py > frame.height) return;
    if (!zone) {
      const z = zoneUnder(atlas, at.x, at.y);
      if (z) {
        onView({ map: view.map, ui: z.ui });
        setHover(null);
      }
    } else if (!truth) onPlace({ map: view.map, x: at.x, y: at.y, ui: zone.ui });
  };

  const pin = (p: { map: number; x: number; y: number } | null) =>
    p && p.map === view.map && onFrame(frame, p.x, p.y) ? toPixel(frame, p.x, p.y) : null;
  const g = pin(guess),
    tr = pin(truth);
  const parent = zone ? parentOf(atlas, zone.ui) : undefined;
  const center = () => [box.current!.clientWidth / 2, box.current!.clientHeight / 2] as const;
  const continents = useMemo(() => [...atlases.values()], [atlases]);

  return (
    <section className="flex min-w-0 flex-col">
      <nav className="relative z-10 flex gap-1 px-3" aria-label="Continents">
        {continents.map((a) => {
          const on = a.frame.map === view.map;
          return (
            <button
              key={a.frame.map}
              aria-pressed={on}
              onClick={() => onView({ map: a.frame.map, ui: null })}
              className={clsx(
                "-mb-[3px] rounded-t-[5px] border border-b-0 px-4 pt-1.5 pb-2 font-display text-[13px] font-bold tracking-wider transition",
                on
                  ? "border-gold-500 bg-ink-900 text-wow"
                  : "border-gold-700/70 bg-ink-800/80 text-gold-500 hover:text-gold-300",
              )}
            >
              {a.name}
            </button>
          );
        })}
      </nav>
      <Frame>
        <div className="flex h-10 items-center gap-2 border-b border-black bg-gradient-to-b from-ink-700 to-ink-800 px-2 shadow-[inset_0_-1px_0_rgb(255_220_150/0.06)]">
          {zone ? (
            <>
              <button
                className="btn-ghost h-7 px-2 text-xs"
                onClick={() => onView({ map: view.map, ui: parent?.ui ?? null })}
              >
                <ChevronLeft size={14} /> {parent?.name ?? atlas.name}
              </button>
              <h2 className="flex-1 truncate text-center font-display text-[15px] font-bold tracking-wide text-wow">
                {zone.name}
              </h2>
              {zone.inside.map((ui) => (
                <button key={ui} className="btn-ghost h-7 px-2 text-xs" onClick={() => onView({ map: view.map, ui })}>
                  {atlas.zones.find((z) => z.ui === ui)?.name} <ChevronRight size={14} />
                </button>
              ))}
            </>
          ) : (
            <h2 className="flex-1 text-center font-display text-[15px] font-bold tracking-wide text-wow">
              {atlas.name}
              <span className="ml-2 font-sans text-xs font-normal tracking-normal text-parch-300/60">pick a zone</span>
            </h2>
          )}
        </div>
        <div
          ref={box}
          className={clsx(
            "relative aspect-[1002/668] touch-none overflow-hidden bg-ink-950 select-none",
            zone ? (truth ? "cursor-grab" : "cursor-crosshair") : "cursor-pointer",
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={() => setHover(null)}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: frame.width,
              height: frame.height,
              transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
            }}
          >
            <img
              src={mapPicture(view.map, view.ui)}
              width={frame.width}
              height={frame.height}
              alt=""
              draggable={false}
              className="block"
            />
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={frame.width}
              height={frame.height}
            >
              {g && tr && (
                <>
                  <line
                    x1={g.px}
                    y1={g.py}
                    x2={tr.px}
                    y2={tr.py}
                    stroke="#000"
                    strokeWidth={5}
                    strokeOpacity={0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={g.px}
                    y1={g.py}
                    x2={tr.px}
                    y2={tr.py}
                    stroke="var(--color-gold-300)"
                    strokeWidth={2.5}
                    strokeDasharray="7 6"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
            {g && <Pin at={g} scale={t.scale} kind="guess" />}
            {tr && <Pin at={tr} scale={t.scale} kind="truth" />}
          </div>
          {hover && (
            <div
              className="tooltip pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap"
              style={{ left: hover.x, top: hover.y }}
            >
              {hover.text}
            </div>
          )}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            <button
              className="btn-ghost size-8"
              aria-label="Zoom in"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => zoomAt(1.5, ...center())}
            >
              <Plus size={16} />
            </button>
            <button
              className="btn-ghost size-8"
              aria-label="Zoom out"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => zoomAt(1 / 1.5, ...center())}
            >
              <Minus size={16} />
            </button>
          </div>
        </div>
      </Frame>
    </section>
  );
}

// a marker on the map, kept the same size at any zoom
function Pin({ at, scale, kind }: { at: { px: number; py: number }; scale: number; kind: "guess" | "truth" }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: at.px, top: at.py, transform: `scale(${1 / scale})` }}>
      {kind === "truth" && (
        <span className="absolute top-0 left-0 size-6 animate-pulse-ring rounded-full border-2 border-truth" />
      )}
      <span
        className={clsx(
          "absolute top-0 left-0 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-gold-200 shadow-[0_0_0_1.5px_#000,0_3px_8px_rgb(0_0_0/0.7)]",
          kind === "guess"
            ? "bg-[radial-gradient(circle_at_35%_35%,#bfe4ff,var(--color-guess)_55%,#1c5a9a)]"
            : "bg-[radial-gradient(circle_at_35%_35%,#ffc2b8,var(--color-truth)_55%,#8a1a10)]",
        )}
      />
    </div>
  );
}
