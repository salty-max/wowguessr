import { useEffect, useRef, useState } from "react";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// a number that counts up to its value when it changes (from: where it
// starts when it first shows, its value unless said)
export function CountUp({ value, ms = 700, from: start0 }: { value: number; ms?: number; from?: number }) {
  const [shown, setShown] = useState(start0 ?? value);
  const from = useRef(start0 ?? value);
  useEffect(() => {
    const start = performance.now(),
      a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms),
        eased = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{fmt(shown)}</>;
}
