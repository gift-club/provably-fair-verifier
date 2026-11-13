/**
 * Wheel for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-11-01 (WheelMath.cs, WheelOptions):
 * - `V1`: (multiple, count) per risk (Low / Medium / High) and segment count (10, 20, 30, 40, 50), in
 *   the server's order (the layout's stable sort by count keeps ties in this order). Pay table version 1 is the only one.
 * - `Layout` (`BuildLayout`): the multiple on each segment, index 0 under the pointer at rest. The top
 *   sits at 0, the blanks are spread evenly through the rest, then the pays fill what is left, the
 *   rarer values first, each spread evenly and nudged to the nearest free slot. Double arithmetic, the
 *   same operations in the same order as the C#.
 * - `TrySegmentFromFloat`: v is the float × 2³² (`PfFloat.uint`), q = ⌊2³² / N⌋; a v at or past q × N
 *   is rejected, otherwise the segment is ⌊v / q⌋. (v mod q) / q sets the rest offset (display only).
 * - `DrawFromFloats` / `DrawPaid`: the first accepted candidate; the float right after it is the Stars
 *   rounding float. `DrawPaid` reads 8 floats and, if every candidate was rejected, 8 more at a time.
 *   Stars and Gram spins draw the same segment.
 * - Stars pay: `PayoutCalculator.ToStars(bet × multiple, roundingFloat)` capped at `MaxWinStars`
 *   (2,500; the stakes a table offers keep the cap from binding). Gram pay: bet × multiple floored to
 *   the nanoton, capped at `MaxWinTon` (25).
 * Pinned by `wheel.test.ts` against `scripts/pf-vectors/wheel.cs`.
 */
import { ratio, toGram, toStars, type PfFloat } from "../provablyFair.js";

export type WheelRisk = "low" | "medium" | "high";

export const WHEEL_RISKS: WheelRisk[] = ["low", "medium", "high"];

/** WheelMath.SegmentCounts. */
export const WHEEL_SEGMENTS = [10, 20, 30, 40, 50] as const;
export type WheelSegments = (typeof WHEEL_SEGMENTS)[number];

/** Floats `DrawPaid` reads at a time. */
export const WHEEL_FLOAT_BLOCK = 8;

/** WheelOptions.MaxWinStars and MaxWinTon. */
export const WHEEL_MAX_WIN_STARS = 2500;
export const WHEEL_MAX_WIN_GRAM = "25";

type Group = readonly [multiple: string, count: number];

/** WheelMath.V1: (multiple, count) per table, the server's order. */
export const WHEEL_TABLES: Record<`${WheelRisk}:${WheelSegments}`, readonly Group[]> = {
  "low:10": [["0", 3], ["1.2", 5], ["1.5", 1], ["2", 1]],
  "low:20": [["0", 5], ["1.2", 13], ["1.4", 1], ["2", 1]],
  "low:30": [["0", 8], ["1.2", 15], ["1.4", 5], ["1.5", 1], ["2", 1]],
  "low:40": [["0", 9], ["1.2", 30], ["2", 1]],
  "low:50": [["0", 12], ["1.2", 32], ["1.4", 4], ["1.5", 1], ["2", 1]],

  "medium:10": [["0", 5], ["1.5", 1], ["1.6", 2], ["1.8", 1], ["3", 1]],
  "medium:20": [["0", 10], ["1.6", 6], ["1.8", 3], ["4", 1]],
  "medium:30": [["0", 15], ["1.5", 1], ["1.6", 10], ["2", 3], ["5", 1]],
  "medium:40": [["0", 20], ["1.6", 15], ["2", 4], ["6", 1]],
  "medium:50": [["0", 25], ["1.5", 1], ["1.6", 20], ["2", 3], ["8", 1]],

  "high:10": [["0", 9], ["9.5", 1]],
  "high:20": [["0", 19], ["19", 1]],
  "high:30": [["0", 29], ["28.5", 1]],
  "high:40": [["0", 39], ["38", 1]],
  "high:50": [["0", 49], ["47.5", 1]],
};

export const wheelTable = (risk: WheelRisk, segments: WheelSegments) => WHEEL_TABLES[`${risk}:${segments}`];

const num = (multiple: string) => Number(multiple);

/** WheelMath.BuildLayout: the multiple on each segment, index 0 under the pointer at rest. */
const buildLayout = (table: readonly Group[], n: number): string[] => {
  const top = table.reduce((best, [m]) => (num(m) > num(best) ? m : best), table[0][0]);
  const slots: (string | null)[] = new Array(n).fill(null);
  slots[0] = top;

  const zeros = table.filter(([m]) => num(m) === 0).reduce((sum, [, count]) => sum + count, 0);
  for (let k = 0; k < zeros; k++) slots[1 + Math.floor(((k + 0.5) * (n - 1)) / zeros)] = "0";

  const free: number[] = [];
  for (let i = 1; i < n; i++) if (slots[i] === null) free.push(i);

  const groups = table
    .map(([m, count]) => ({ multiple: m, count: num(m) === num(top) ? count - 1 : count }))
    .filter((g) => g.count > 0 && num(g.multiple) > 0)
    .sort((a, b) => a.count - b.count); // stable, as the C# OrderBy

  const len = free.length;
  groups.forEach((g, gi) => {
    const step = len / g.count;
    const offset = step / 2 + (gi * step) / (groups.length + 1);
    for (let k = 0; k < g.count; k++) {
      const ideal = Math.floor(offset + k * step) % len;
      for (let d = 0; d < len; d++) {
        const a = free[(ideal + d) % len];
        const b = free[(ideal - d + len) % len];
        if (slots[a] === null) { slots[a] = g.multiple; break; }
        if (slots[b] === null) { slots[b] = g.multiple; break; }
      }
    }
  });

  if (slots.some((s) => s === null)) throw new Error("Wheel layout left a segment empty");
  return slots as string[];
};

const layoutCache = new Map<string, string[]>();

/** WheelMath.Layout (pay table version 1): the multiple on each segment, clockwise from the top. */
export const wheelLayout = (risk: WheelRisk, segments: WheelSegments): string[] => {
  const key = `${risk}:${segments}`;
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = buildLayout(WHEEL_TABLES[`${risk}:${segments}` as keyof typeof WHEEL_TABLES], segments);
    layoutCache.set(key, layout);
  }
  return layout;
};

const TWO_32 = 4294967296;

/** WheelMath.TrySegmentFromFloat: the segment and rest offset a candidate names, or null if rejected. */
export const wheelSegmentFromFloat = (candidate: PfFloat, segments: number) => {
  const v = candidate.uint;
  const q = Math.floor(TWO_32 / segments);
  if (v >= q * segments) return null;
  const within = (v % q) / q;
  return { segment: Math.floor(v / q), restOffset: Math.min(1, Math.max(-1, within * 2 - 1)) };
};

/** WheelMath.DrawFromFloats: the first accepted candidate and the float after it, or null. */
export const wheelDrawFromFloats = (floats: PfFloat[], segments: number) => {
  for (let i = 0; i < floats.length - 1; i++) {
    const hit = wheelSegmentFromFloat(floats[i], segments);
    if (hit) return { ...hit, candidateIndex: i, roundingFloat: floats[i + 1] };
  }
  return null;
};

/** WheelPaidService Stars pay: ToStars(bet × multiple, rounding float), capped, 0 on a blank. */
export const wheelStars = (bet: number, multiple: string, roundingFloat: PfFloat) =>
  num(multiple) > 0 ? Math.min(toStars(bet, ratio(multiple), roundingFloat), WHEEL_MAX_WIN_STARS) : 0;

/** WheelPaidService Gram pay: bet × multiple floored to the nanoton, capped at 25. */
export const wheelGram = (bet: string, multiple: string) =>
  num(multiple) > 0 ? toGram(bet, ratio(multiple), WHEEL_MAX_WIN_GRAM) : "0";
