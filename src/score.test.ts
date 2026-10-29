import { expect, test } from "bun:test";
import { score } from "./score";

test("score falls with distance", () => {
  expect(score(10)).toBe(5000);
  expect(score(100000)).toBe(0);
  expect(score(1000)).toBeLessThan(score(500));
});
