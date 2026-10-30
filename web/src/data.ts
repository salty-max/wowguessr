// The game's data, as scripts/site.ts writes it into web/public/: the
// rounds and each continent's atlas (its maps' frames, areas and zones).
import { useEffect, useState } from "react";
import type { Atlas, Round } from "../../src/atlas";

// cover: the picture behind the intro, drawn once when the data comes
export type Data = { rounds: Round[]; atlases: Map<number, Atlas>; cover: number };

const json = async <T>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} (run bun run data)`);
  return r.json() as Promise<T>;
};

export function useData(): { data?: Data; error?: string } {
  const [state, setState] = useState<{ data?: Data; error?: string }>({});
  useEffect(() => {
    Promise.all([json<Round[]>("rounds.json"), json<Atlas>("maps/0.json"), json<Atlas>("maps/1.json")])
      .then(([rounds, ...maps]) =>
        setState({
          data: {
            rounds,
            atlases: new Map(maps.map((a) => [a.frame.map, a])),
            cover: rounds[Math.floor(Math.random() * rounds.length)].id,
          },
        }),
      )
      .catch((e: Error) => setState({ error: e.message }));
  }, []);
  return state;
}

export const mapPicture = (map: number, ui: number | null) =>
  ui == null ? `maps/${map}.webp` : `maps/zones/${ui}.webp`;
export const picture = (id: number) => `pictures/${id}.webp`;
