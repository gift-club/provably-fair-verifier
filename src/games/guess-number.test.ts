import { describe, expect, it } from "vitest";
import vectors from "./guess-number.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, ratio, toGram, toStars } from "../provablyFair.js";
import {
  GUESS_NUMBER_FLOATS,
  GUESS_NUMBER_LEVELS,
  GUESS_NUMBER_WINDOW,
  guessNumberHints,
  guessNumberOutcome,
  guessNumberRollStart,
  guessNumberRoundingNonce,
} from "./guess-number.js";

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/guess-number.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];

describe.each(vectors.cases)("Guess Number vectors for nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);

  it("places the window and the secret for every level", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, GUESS_NUMBER_FLOATS.stars);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    for (const [risk, expected] of Object.entries(c.risks)) {
      const level = GUESS_NUMBER_LEVELS[risk as keyof typeof GUESS_NUMBER_LEVELS];
      expect(level).toEqual({ range: expected.range, maxGuesses: expected.maxGuesses, multiplier: expected.multiplier });
      expect(guessNumberOutcome(f, level.range)).toEqual({
        minNumber: expected.minNumber,
        maxNumber: expected.maxNumber,
        secretNumber: expected.secretNumber,
      });
    }
  });

  it("replays a round dealt before the window slid, from one float", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, GUESS_NUMBER_FLOATS.legacy);
    for (const [range, secret] of Object.entries(c.legacy)) expect(guessNumberOutcome(f, Number(range), true).secretNumber).toBe(secret);
  });

  it("rounds a Stars win on float 0 of the next nonce", async () => {
    const [rounding] = await generateFloats(seed, c.clientSeed, guessNumberRoundingNonce(c.nonce), 1);
    expect(rounding.value).toBe(c.roundingFloat);
    for (const [m, stars] of Object.entries(c.stars)) expect(BETS.map((b) => toStars(b, ratio(m), rounding))).toEqual(stars);
  });
});

describe("Guess Number helpers", () => {
  it("carries the server's window bounds and levels", () => {
    expect(GUESS_NUMBER_WINDOW).toEqual({ lowestStart: vectors.lowestStart, highestNumber: vectors.highestNumber });
    expect(GUESS_NUMBER_LEVELS).toEqual(vectors.levels);
  });

  it("starts the window exactly where GuessNumberOptions.RollStart does", () => {
    for (const r of vectors.rollStarts) expect(guessNumberRollStart(r.range, r.roll)).toBe(r.start);
  });

  it("pays Gram on every tier", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
    expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(GUESS_NUMBER_LEVELS.low.multiplier)))).toEqual(vectors.gram.low);
    expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(GUESS_NUMBER_LEVELS.medium.multiplier)))).toEqual(vectors.gram.medium);
  });

  it("gives the hints the server gives", () => {
    expect(guessNumberHints(300, [500, 250, 300, 400])).toEqual({
      hints: [
        { guess: 500, hint: "lower" },
        { guess: 250, hint: "higher" },
        { guess: 300, hint: "correct" },
      ],
      won: true,
      lost: false,
    });
    const miss = guessNumberHints(300, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(miss.hints).toHaveLength(7);
    expect(miss).toMatchObject({ won: false, lost: true });
  });
});
