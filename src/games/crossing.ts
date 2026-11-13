/**
 * Wind-up Crossing for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-12:
 * - `CrossingService.StartAsync` / `StartTonAsync`: `CrossingMath.FloatCount` (2) floats either way.
 *   Float 0 draws the hit lane once, at the start, and the round never changes it. Float 1 is the
 *   `PayoutCalculator.ToStars` rounding float of a Stars cash-out (a Gram round draws it and leaves
 *   it unused). A Spark round never reads this stream.
 * - `CrossingMath.HitLane`: the geometric draw with no logarithm. With u the float's 32-bit integer,
 *   lane n is survived while u · 10000^n < s_bp^n · 2^32, and the hit lane is the first n that fails.
 *   `Lanes + 1` means the hero reached the far side. BigInt, so no rounding can move a lane.
 * - `CrossingMath.MultiplierAt`: m_n = floor(rtp_bp · 100 · 10000^n / (10000 · s_bp^n)) / 100.
 * - `CrossingMath.LanesUnderCap`: a road ends at the last lane whose multiplier fits under 100x.
 * - A cash-out after lane n pays m_n when n is below the hit lane; a hit pays nothing.
 *   The far side (lane = Lanes) settles by itself. Stars: `CrossingMath.SettleStars`, capped at
 *   `MaxWinStars`. Gram: floored to the nanoton, capped at `MaxWinTon`, no rounding draw.
 * Pinned by `crossing.test.ts` against `scripts/pf-vectors/crossing.cs`.
 */
import { GRAM_MAX_WIN, ratio, toGram, toStars, type PfFloat, type Ratio } from "../provablyFair.js";

export type CrossingRoad = "Easy" | "Medium" | "Hard" | "Daredevil";

export const CROSSING_ROADS: CrossingRoad[] = ["Easy", "Medium", "Hard", "Daredevil"];

/** `CrossingMath.SurvivalBasisPoints`: the chance of surviving one lane, in basis points. */
export const CROSSING_SURVIVAL_BP: Record<CrossingRoad, number> = {
  Easy: 9200,
  Medium: 8600,
  Hard: 7500,
  Daredevil: 6000,
};

/** `CrossingOptions.TargetRtp` (0.95) in basis points; the ladder is built from it. */
const TARGET_BP = 9500n;

/** `CrossingOptions.MaxMultiplier`, in hundredths: the longest road whose last lane pays 100x or less. */
const MAX_MULTIPLIER_CENTS = 10_000n;

/** Floats one round draws, Stars and Gram alike. */
export const CROSSING_FLOATS = { stars: 2, gram: 2 } as const;

export const CROSSING_HIT_FLOAT_INDEX = 0;
export const CROSSING_ROUNDING_FLOAT_INDEX = 1;

/** `CrossingOptions.BetTiers` / `MaxWinStars`, appsettings.json. */
export const CROSSING_BET_TIERS = [1, 5, 10, 20, 50, 100];
export const CROSSING_MAX_WIN_STARS = 10_000;

const BP = 10_000n;
const TWO_32 = 4294967296n;

/** `CrossingMath.MultiplierAt` in cents: floor(rtp_bp · 100 · 10000^n / (10000 · s_bp^n)). */
const multiplierCents = (road: CrossingRoad, lane: number) => {
  const s = BigInt(CROSSING_SURVIVAL_BP[road]);
  const n = BigInt(lane);
  return (TARGET_BP * 100n * BP ** n) / (BP * s ** n);
};

/** "1.03", the server's two-decimal multiplier for a lane. */
const centsText = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;

/** `CrossingMath.LanesUnderCap`. */
export const crossingLanes = (road: CrossingRoad) => {
  let lanes = 0;
  while (multiplierCents(road, lanes + 1) <= MAX_MULTIPLIER_CENTS) lanes++;
  return lanes;
};

/** `CrossingMath.Ladder`: m_1 … m_Lanes as two-decimal strings. Index 0 is lane 1. */
export const crossingLadder = (road: CrossingRoad) =>
  Array.from({ length: crossingLanes(road) }, (_, i) => centsText(multiplierCents(road, i + 1)));

/** `CrossingMath.HitLane`, from the hit float's 32-bit integer. */
export const crossingHitLane = (road: CrossingRoad, hit: PfFloat) => {
  const lanes = crossingLanes(road);
  const s = BigInt(CROSSING_SURVIVAL_BP[road]);
  let scaled = BigInt(hit.uint);
  let threshold = TWO_32;
  for (let n = 1; n <= lanes; n++) {
    scaled *= BP;
    threshold *= s;
    if (scaled >= threshold) return n;
  }
  return lanes + 1;
};

/** The draw: the road, its length, its ladder and the lane the hero is hit on (`lanes + 1` = never). */
export const crossingDraw = (floats: PfFloat[], road: CrossingRoad) => {
  const ladder = crossingLadder(road);
  return { road, lanes: ladder.length, ladder, hitLane: crossingHitLane(road, floats[CROSSING_HIT_FLOAT_INDEX]) };
};

/**
 * One round for a chosen cash-out lane (1-based, from 1 to the far side). Reaching a lane below
 * the hit lane pays that lane's multiplier; reaching the hit lane or any lane past it is a hit.
 */
export const crossingOutcome = (floats: PfFloat[], road: CrossingRoad, cashoutLane: number) => {
  const draw = crossingDraw(floats, road);
  const lane = Math.min(draw.lanes, Math.max(1, Math.trunc(cashoutLane)));
  const hit = lane >= draw.hitLane;
  const multiplier = hit ? "0" : draw.ladder[lane - 1];
  return {
    ...draw,
    lane,
    hit,
    farSide: draw.hitLane > draw.lanes,
    multiplier,
    /** The multiplier of the lane before the hit, i.e. the best cash-out this round allowed. */
    bestLane: Math.min(draw.hitLane - 1, draw.lanes),
    roundingFloat: floats[CROSSING_ROUNDING_FLOAT_INDEX] as PfFloat | undefined,
  };
};

/** `CrossingMath.SettleStars`. */
export const crossingStars = (bet: number, multiplier: Ratio, rounding: PfFloat) =>
  Math.min(toStars(bet, multiplier, rounding), CROSSING_MAX_WIN_STARS);

/** `CrossingMath.SettleTon`, as a decimal string. */
export const crossingGram = (bet: string, multiplier: string) => toGram(bet, ratio(multiplier), GRAM_MAX_WIN);
