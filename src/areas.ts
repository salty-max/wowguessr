// The areas the client names on each map chunk under a continent's map
// (atlas.ts' Areas), from wow-data's terrain_chunk: the zone and the subzone
// under a guess, and the zone a click on the continent opens.
import type { Areas, Frame } from "./atlas";
import { CHUNK, ORIGIN, type Ground } from "./ground";

export function areaRuns(ground: Ground, f: Frame): Areas {
  const row0 = Math.floor((ORIGIN - f.top) / CHUNK), col0 = Math.floor((ORIGIN - f.left) / CHUNK);
  const rows = Math.ceil((f.height * f.yards) / CHUNK) + 1, cols = Math.ceil((f.width * f.yards) / CHUNK) + 1;
  const runs: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const out: number[] = [];
    for (let k = 0; k < cols; k++) {
      const a = ground.area(ORIGIN - (row0 + r + 0.5) * CHUNK, ORIGIN - (col0 + k + 0.5) * CHUNK) ?? 0;
      if (out.length && out[out.length - 2] === a) out[out.length - 1]++;
      else out.push(a, 1);
    }
    runs.push(out);
  }
  // rows of sea at either end say nothing
  while (runs.length && runs[runs.length - 1].length === 2 && runs[runs.length - 1][0] === 0) runs.pop();
  let skip = 0;
  while (skip < runs.length && runs[skip].length === 2 && runs[skip][0] === 0) skip++;
  return { row0: row0 + skip, col0, runs: runs.slice(skip) };
}
