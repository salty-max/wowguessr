// A picture in a box, zoomed and panned: fitted whole when its frame changes
// or the box changes size, zoomed about a point (the wheel, a pinch, the
// buttons) up to 4 times the fit, panned by drags, never pulled off the box.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Frame } from "../../../src/atlas";

export type Transform = { scale: number; tx: number; ty: number };

const MAX = 4;

// box: the element the picture is shown in, to attach (ref={box})
export function usePanZoom(frame: Frame, key: string) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const fitScale = useRef(1);

  // the picture keeps the box covered, or stays in its middle when smaller
  const clamp = useCallback(
    (next: Transform): Transform => {
      const el = box.current;
      if (!el) return next;
      const w = el.clientWidth,
        h = el.clientHeight,
        W = frame.width * next.scale,
        H = frame.height * next.scale;
      return {
        scale: next.scale,
        tx: W <= w ? (w - W) / 2 : Math.min(0, Math.max(w - W, next.tx)),
        ty: H <= h ? (h - H) / 2 : Math.min(0, Math.max(h - H, next.ty)),
      };
    },
    [frame],
  );

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    fitScale.current = Math.min(el.clientWidth / frame.width, el.clientHeight / frame.height);
    setT(clamp({ scale: fitScale.current, tx: 0, ty: 0 }));
  }, [frame, clamp]);

  const zoomAt = useCallback(
    (k: number, cx: number, cy: number) =>
      setT((t) => {
        const scale = Math.min(fitScale.current * MAX, Math.max(fitScale.current * 0.95, t.scale * k));
        return clamp({ scale, tx: cx - ((cx - t.tx) * scale) / t.scale, ty: cy - ((cy - t.ty) * scale) / t.scale });
      }),
    [clamp],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => setT((t) => clamp({ ...t, tx: t.tx + dx, ty: t.ty + dy })),
    [clamp],
  );

  // frame points of the picture (pixels) together, with room around them
  const show = useCallback(
    (points: { px: number; py: number }[]) => {
      const el = box.current;
      if (!el || !points.length) return;
      const w = el.clientWidth,
        h = el.clientHeight,
        pad = 70;
      const xs = points.map((p) => p.px),
        ys = points.map((p) => p.py);
      const spanX = Math.max(...xs) - Math.min(...xs) + 1,
        spanY = Math.max(...ys) - Math.min(...ys) + 1;
      const scale = Math.max(
        fitScale.current,
        Math.min(fitScale.current * MAX * 0.5, (w - 2 * pad) / spanX, (h - 2 * pad) / spanY),
      );
      const mx = (Math.max(...xs) + Math.min(...xs)) / 2,
        my = (Math.max(...ys) + Math.min(...ys)) / 2;
      setT(clamp({ scale, tx: w / 2 - mx * scale, ty: h / 2 - my * scale }));
    },
    [clamp],
  );

  // a new picture (key): fitted again; a resized box (the dock growing on a
  // hover): the same view, scaled with it, so a zoom isn't lost
  useLayoutEffect(() => {
    fit();
    const el = box.current;
    if (!el) return;
    let width = el.clientWidth;
    const seen = new ResizeObserver(() => {
      const now = el.clientWidth;
      if (!now || now === width) return;
      // laid out only now: fitted, nothing to keep yet
      if (!width) {
        width = now;
        fit();
        return;
      }
      const k = now / width;
      width = now;
      fitScale.current *= k;
      setT((t) => clamp({ scale: t.scale * k, tx: t.tx * k, ty: t.ty * k }));
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [key, fit, clamp]);

  return { box, t, zoomAt, panBy, show, fit };
}
