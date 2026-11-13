/**
 * The winner's share of a PvP pot, shared by every duel (Dice Duel, Balloon Pump, Minefield,
 * Ludo, Sea Battle, Dama and Checkers). Mirrors `PvpStakeLedger.Pot` and every
 * `Pvp*Options.HouseEdgePercent` (0.05), read 2026-10-03 and for Dama 2026-10-26.
 *
 * - Stars: `PayoutCalculator.ToStars(2 × stake × (1 − 0.05), roundingFloat)`, i.e. stake × 1.90
 *   rounded stochastically on the match's own rounding float. On the shipped tiers (5, 10, 20, 50,
 *   100) only the 5-Star pot has a fraction (9.5), so only it depends on the float. Dama also
 *   takes ★1, whose 1.9 pot depends on it too (`PVP_DAMA_STAR_STAKES`).
 * - Gram: `TonPayoutCalculator.ToTon(2 × stake × 0.95)`, floored to the nanoton. No rounding
 *   float and no cap (`Pot` does not apply `MaxWinTon`; the top tier pays 19 GRAM).
 * - A free (XP) duel has no pot at all.
 */
import { type PfFloat, ratio, toGram, toStars } from "../provablyFair.js";

/** Every PvP game's `HouseEdgePercent`. */
export const PVP_HOUSE_EDGE = "0.05";

/** 2 × (1 − 0.05): the winner's payout as a multiple of their own stake. */
export const PVP_WIN_MULTIPLIER = "1.90";

/** `BetTiers` of every PvP game but Dama, which adds ★1. */
export const PVP_STAR_STAKES = [5, 10, 20, 50, 100] as const;

const winRatio = ratio(PVP_WIN_MULTIPLIER);

/** Stars credited to the winner of a Stars match at `stake`. */
export const pvpStarsPayout = (stake: number, roundingFloat: PfFloat): number => toStars(stake, winRatio, roundingFloat);

/** Gram credited to the winner of a Gram match at `stake` ("0.5"), as the app prints it. */
export const pvpGramPayout = (stake: string): string => toGram(stake, winRatio, "1000000000");
