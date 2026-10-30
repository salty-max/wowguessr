// A game's state: its five rounds, the one at hand, the map on show, the
// guess, the results so far.
import type { Guess, Result, Round } from "../../src/atlas";

export const ROUNDS = 5;

export type View = { map: number; ui: number | null };
export type Played = { round: Round; guess: Guess; result: Result };
export type State = {
  phase: "intro" | "play" | "summary";
  rounds: Round[];
  at: number;
  view: View;
  guess: Guess | null;
  revealed: boolean;
  results: Played[];
};

export type Action =
  | { type: "start"; rounds: Round[] }
  | { type: "view"; view: View }
  | { type: "place"; guess: Guess }
  | { type: "reveal"; result: Result; view: View }
  | { type: "next" };

export const initial: State = {
  phase: "intro",
  rounds: [],
  at: 0,
  view: { map: 0, ui: null },
  guess: null,
  revealed: false,
  results: [],
};

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "start":
      return { ...initial, phase: "play", rounds: a.rounds, view: { map: s.view.map, ui: null } };
    case "view":
      // a pin on the other continent would be judged unseen: a switch before the reveal drops it
      return { ...s, view: a.view, guess: !s.revealed && s.guess && a.view.map !== s.guess.map ? null : s.guess };
    case "place":
      return s.revealed ? s : { ...s, guess: a.guess };
    case "reveal":
      if (!s.guess || s.revealed) return s;
      return {
        ...s,
        revealed: true,
        view: a.view,
        results: [...s.results, { round: s.rounds[s.at], guess: s.guess, result: a.result }],
      };
    case "next":
      if (s.at + 1 >= s.rounds.length) return { ...s, phase: "summary" };
      return { ...s, at: s.at + 1, guess: null, revealed: false, view: { map: s.view.map, ui: null } };
  }
}

export const total = (s: State) => s.results.reduce((sum, p) => sum + p.result.points, 0);
