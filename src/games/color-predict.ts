/**
 * Color Predict for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-03:
 * - `ColorPredictPaidService.PlayPaidAsync` (Stars): two floats. Float 0 is the roll,
 *   min(floor(f × 10), 9); float 1 is the `PayoutCalculator.ToStars` rounding float.
 * - `ColorPredictPaidService.PlayPaidTonAsync` (Gram): one float, the same roll, paid with
 *   `TonPayoutCalculator.ToTon` capped at `MaxWinTon` (1000 GRAM).
 * - `ColorPredictService.GetColor` / `IsWinningBet`: 0 and 5 are violet, other odd numbers red,
 *   other even numbers green. A colour bet wins on its own colour only.
 * - `ColorPredictOptions` / the ColorPredict block of appsettings.json: 2.375 / 2.375 / 4.75.
 *
 * Each round stores the multiplier it paid (`multiplier` in the verify response), so a round
 * from an older table verifies against its own figure. Pinned by `color-predict.test.ts`
 * against `scripts/pf-vectors/color-predict.cs`.
 */
import type { PfFloat } from "../provablyFair.js";

export type ColorPredictChoice = "red" | "green" | "violet";
export type ColorPredictColor = ColorPredictChoice;

export const COLOR_PREDICT_CHOICES: ColorPredictChoice[] = ["red", "green", "violet"];

/** Floats one round draws: Stars adds the rounding float after the roll, Gram does not. */
export const COLOR_PREDICT_FLOATS = { stars: 2, gram: 1 } as const;

export type ColorPredictTable = Record<ColorPredictChoice, string>;

/** Today's multipliers per colour. */
export const COLOR_PREDICT_MULTIPLIERS: ColorPredictTable = { red: "2.375", green: "2.375", violet: "4.75" };

/**
 * Tables older Stars rounds were paid on. 2026-08-15 to 2026-08-18 drew the same two floats
 * and rounded the same way. Rounds before 2026-08-15 drew one float and truncated the payout
 * (2.30 / 2.30 / 4.60), so only their roll verifies.
 */
export const COLOR_PREDICT_LEGACY_TABLES = {
  "2026-08-15": { red: "2.45", green: "2.45", violet: "4.90" },
  "2026-04-16": { red: "2.30", green: "2.30", violet: "4.60" },
} as const satisfies Record<string, ColorPredictTable>;

/** The winning number 0–9 from the roll float. */
export const colorPredictNumber = (roll: PfFloat) => Math.min(Math.trunc(roll.value * 10), 9);

/** ColorPredictService.GetColor */
export const colorPredictColor = (n: number): ColorPredictColor => (n === 0 || n === 5 ? "violet" : n % 2 === 1 ? "red" : "green");

/**
 * One round from its floats. `multiplier` is "0" on a loss. `roundingFloat` is undefined when
 * only the Gram round's single float was passed.
 */
export const colorPredictOutcome = (
  floats: PfFloat[],
  choice: ColorPredictChoice,
  table: ColorPredictTable = COLOR_PREDICT_MULTIPLIERS,
) => {
  const number = colorPredictNumber(floats[0]);
  const color = colorPredictColor(number);
  const win = color === choice;
  return {
    number,
    color,
    isViolet: color === "violet",
    win,
    multiplier: win ? table[choice] : "0",
    roundingFloat: floats[1] as PfFloat | undefined,
  };
};
