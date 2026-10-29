/** Points for a guess: 5000 under 50 yards, falling to 0 at maxYards. */
export function score(distanceYards: number, maxYards = 4000): number {
  if (distanceYards <= 50) return 5000;
  if (distanceYards >= maxYards) return 0;
  return Math.round(5000 * (1 - (distanceYards - 50) / (maxYards - 50)));
}
