/**
 * Rock Paper Scissors for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-03:
 * - `RockPaperScissorsService.StartGameAsync` / `StartGameTonAsync` commit one nonce to the
 *   whole game. `DrawHouseChoiceAsync`: throw n (counting from 0, ties included) reads float n
 *   at that nonce, so a game uses as many floats as it had throws (`roundsPlayed` in the verify
 *   response), Stars and Gram alike.
 * - `RockPaperScissorsMath`: the house hand is min(floor(f × n), n − 1) with n = 3 (Classic) or
 *   5 (LizardSpock); signs 0 Rock, 1 Paper, 2 Scissors, 3 Spock, 4 Lizard; with
 *   d = (player − house + n) mod n, 0 ties, odd wins, even loses. A tie costs nothing and moves
 *   nothing. Ladder 1.90 / 3.80 / 7.60 / 15.20 / 30.40 for k wins, both variants; five wins
 *   force the cash-out. Cashing out at 0 wins hands the stake back (1.0).
 * - `GetRoundingFloatAsync`: a Stars cash-out settles `PayoutCalculator.ToStars` on float 0 of
 *   a separate stream, client seed + ":payout" at the game's nonce, one float for the whole
 *   game, the forced cash-out at five wins included (★1 × 30.40 pays 30 or 31 on that float;
 *   at a multiple of 5 it is whole). Gram cash-outs pay
 *   `TonPayoutCalculator.ToTon` capped at `MaxWinTon` (1000 GRAM) and draw no rounding float.
 *
 * Free (Sparks) games commit a nonce from the same seed too, so they verify the same way.
 * Pinned by `rock-paper-scissors.test.ts` against `scripts/pf-vectors/rock-paper-scissors.cs`.
 */
import type { PfFloat } from "../provablyFair.js";

export type RpsVariant = "Classic" | "LizardSpock";
export type RpsResult = "Tie" | "Win" | "Lose";

/** Index = the sign number the server uses. */
export const RPS_SIGNS = ["rock", "paper", "scissors", "spock", "lizard"] as const;

export const RPS_SIGN_COUNT: Record<RpsVariant, number> = { Classic: 3, LizardSpock: 5 };

/** RockPaperScissorsMath.Multipliers: rung k at index k − 1, 0.95 × 2^k. */
export const RPS_MULTIPLIERS = ["1.90", "3.80", "7.60", "15.20", "30.40"];

/**
 * The ladder of 2026-08-15 to 2026-08-18 (0.98 × 2^k). Payout rounding on the ":payout" stream
 * began 2026-08-16; before that, and for games with no seed commitment, it is not verifiable.
 */
export const RPS_LEGACY_MULTIPLIERS = ["1.96", "3.92", "7.84", "15.68", "31.36"];

export const RPS_MAX_ROUNDS = 5;

/** Appended to the client seed for the payout-rounding stream. */
export const RPS_PAYOUT_SUFFIX = ":payout";

/** Floats one game draws at its nonce: one per throw, ties included. Stars adds one on ":payout". */
export const rpsFloatCount = (throws: number) => throws;

/** RockPaperScissorsMath.HouseChoice */
export const rpsHouseChoice = (f: PfFloat, variant: RpsVariant) => {
  const n = RPS_SIGN_COUNT[variant];
  return Math.min(Math.trunc(f.value * n), n - 1);
};

/** RockPaperScissorsMath.Outcome, for the player. */
export const rpsResult = (player: number, house: number, variant: RpsVariant): RpsResult => {
  const n = RPS_SIGN_COUNT[variant];
  const d = (((player - house) % n) + n) % n;
  return d === 0 ? "Tie" : d % 2 === 1 ? "Win" : "Lose";
};

/** RockPaperScissorsMath.MultiplierAt: "1.0" before the first win. */
export const rpsMultiplierAt = (wins: number, ladder: string[] = RPS_MULTIPLIERS) => (wins > 0 ? ladder[wins - 1] : "1.0");

/** The house hand of every throw the floats cover (`houseChoices` in the verify response). */
export const rpsHouseChoices = (floats: PfFloat[], variant: RpsVariant) => floats.map((f) => rpsHouseChoice(f, variant));

/**
 * A game replayed from its floats and the player's hands, the way `PlayRoundAsync` plays it:
 * throw n meets house float n, a loss ends the game, five wins end it. Hands past the end are
 * ignored. `multiplier` is what a cash-out after the last throw pays ("0" once lost).
 * `roundingFloat` is the ":payout" stream's float 0, passed in for a Stars game.
 */
export const rpsOutcome = (
  floats: PfFloat[],
  variant: RpsVariant,
  playerHands: number[],
  ladder: string[] = RPS_MULTIPLIERS,
  roundingFloat?: PfFloat,
) => {
  const throws: { player: number; house: number; result: RpsResult }[] = [];
  let wins = 0;
  let lost = false;
  for (let t = 0; t < playerHands.length && t < floats.length && !lost && wins < RPS_MAX_ROUNDS; t++) {
    const house = rpsHouseChoice(floats[t], variant);
    const result = rpsResult(playerHands[t], house, variant);
    if (result === "Win") wins++;
    if (result === "Lose") lost = true;
    throws.push({ player: playerHands[t], house, result });
  }
  return {
    throws,
    wins,
    lost,
    /** Five wins: the server cashed out on its own, at bet × 30.40 on the rounding draw. */
    forcedCashOut: wins === RPS_MAX_ROUNDS,
    multiplier: lost ? "0" : rpsMultiplierAt(wins, ladder),
    roundingFloat,
  };
};
