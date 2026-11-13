/**
 * Guess Number for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-03:
 * - `GuessNumberPaidService.StartPaidGameAsync` / `StartPaidGameTonAsync`: two floats at the
 *   round's nonce, for Stars and Gram alike. Float 1 places the window,
 *   `GuessNumberOptions.RollStart` (start in 100..(999 − range + 1)); float 0 places the secret
 *   inside it, min + min(floor(f × range), range − 1).
 * - `GuessNumberPaidService.GuessPaidAsync`: a Stars win settles `PayoutCalculator.ToStars` on
 *   float 0 of the **next** nonce (the seed state's nonce at the win, which is the round's
 *   nonce + 1: no other paid start, rotation or client-seed change can land while a round is
 *   open). So a won Stars round uses two nonces, and the next round starts at nonce + 2. A Gram
 *   win pays `TonPayoutCalculator.ToTon` capped at `MaxWinTon` (1000 GRAM) and draws nothing.
 * - `GuessNumberOptions` / the GuessNumber block of appsettings.json: low 200 wide at 1.4961×,
 *   medium 500 wide at 3.7402×, seven guesses each.
 *
 * Rounds dealt before 2026-09-12 drew one float and always started at 1 (the verify response's
 * `minNumber` is 1 for them, never for a sliding window). Each round stores its own range and
 * multiplier. Pinned by `guess-number.test.ts` against `scripts/pf-vectors/guess-number.cs`.
 */
import type { PfFloat } from "../provablyFair.js";

export type GuessNumberRisk = "low" | "medium";

/** Floats drawn at the round's nonce. A Stars win also draws one float at nonce + 1. */
export const GUESS_NUMBER_FLOATS = { stars: 2, gram: 2, legacy: 1 } as const;

/** GuessNumberOptions.RiskLevels */
export const GUESS_NUMBER_LEVELS: Record<GuessNumberRisk, { range: number; maxGuesses: number; multiplier: string }> = {
  low: { range: 200, maxGuesses: 7, multiplier: "1.4961" },
  medium: { range: 500, maxGuesses: 7, multiplier: "3.7402" },
};

/** GuessNumberOptions.LowestStart / HighestNumber: the sliding window stays three digits. */
export const GUESS_NUMBER_WINDOW = { lowestStart: 100, highestNumber: 999 } as const;

/** GuessNumberOptions.StartBounds: where a window of this width may start, inclusive. */
export const guessNumberStartBounds = (range: number) => {
  const max = GUESS_NUMBER_WINDOW.highestNumber - range + 1;
  return max < GUESS_NUMBER_WINDOW.lowestStart ? { min: 1, max: 1 } : { min: GUESS_NUMBER_WINDOW.lowestStart, max };
};

/** GuessNumberOptions.RollStart, on the float's double value as the server reads it. */
export const guessNumberRollStart = (range: number, roll: number) => {
  const { min, max } = guessNumberStartBounds(range);
  return Math.min(min + Math.trunc(roll * (max - min + 1)), max);
};

/** The nonce whose float 0 rounds a Stars win. */
export const guessNumberRoundingNonce = (nonce: number) => nonce + 1;

/**
 * The window and the secret of a round of the given width (`range` in the verify response;
 * low 200, medium 500, and 1000 / 5000 on old rounds). `legacy` replays a round dealt before
 * 2026-09-12, whose window was fixed at 1..range and which drew float 0 only.
 */
export const guessNumberOutcome = (floats: PfFloat[], range: number, legacy = false) => {
  const minNumber = legacy ? 1 : guessNumberRollStart(range, floats[1].value);
  const secretNumber = minNumber + Math.min(Math.trunc(floats[0].value * range), range - 1);
  return { minNumber, maxNumber: minNumber + range - 1, secretNumber };
};

export type GuessNumberHint = "higher" | "lower" | "correct";

/**
 * The hints the server gave a run of guesses (`GuessPaidAsync`): a guess below the secret says
 * "higher", above it "lower". The round ends on the correct guess or after `maxGuesses`.
 */
export const guessNumberHints = (secretNumber: number, guesses: number[], maxGuesses = 7) => {
  const hints: { guess: number; hint: GuessNumberHint }[] = [];
  for (const guess of guesses.slice(0, maxGuesses)) {
    const hint: GuessNumberHint = guess === secretNumber ? "correct" : guess < secretNumber ? "higher" : "lower";
    hints.push({ guess, hint });
    if (hint === "correct") break;
  }
  const won = hints[hints.length - 1]?.hint === "correct";
  return { hints, won, lost: !won && hints.length === maxGuesses };
};
