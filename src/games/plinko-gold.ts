/**
 * Plinko Gold for the provably fair checker. Read 2026-10-07 from:
 * - `PlinkoGoldPaidService.DropPaidAsync` / `DropPaidTonAsync` and `GetVerificationAsync`
 *   (`FloatsPerDrop(rows)` = rows × 2: floats 0 to rows−1 drop the wagered ball, floats rows to
 *   2×rows−1 the golden ball; `PlinkoGoldMath.PathFromFloats`: a float ≥ 0.5 bounces right);
 * - `PlinkoGoldMath` (boards of 8, 12 and 16 rows, the tables, `IsBonusTriggered`, `GetFinalSlot`,
 *   `MaxWinStars` 10,000);
 * - the `PlinkoGold` block of appsettings.json (`MaxWinTon` 1000).
 *
 * The golden ball: after four rows the wagered ball sits in column (rights so far); column 0 or 4
 * is a bonus peg on every board, and touching one drops a golden ball through the whole board on
 * the second block of floats, paid from the same table at the same stake. All 2 × rows floats are
 * drawn whether or not it fires. A round's board is its `rows` (8, 12 or 16; a round from before the
 * board picker has 8).
 *
 * Rounding (read 2026-10-14, `PlinkoGoldMath.StarsPayout`, `PlinkoGoldPaidService.FloatsPerStarsDrop`):
 * every multiplier is a multiple of 0.2, so a Stars payout is whole only at a bet that is a multiple
 * of 5. A Stars drop therefore draws one float more, at index `2 × rows` (after both balls' blocks),
 * and pays `min(ToStars(bet × (m + golden m), float), 10,000)`: stochastic rounding, exact in
 * expectation. The golden ball's share rounds on the same float and never exceeds the total. Gram
 * draws no extra float and pays `min(floor_nano(bet × total), 1000)`. Rounds from before ★1 bets
 * stored no rounding float and truncated, which lost nothing (every bet was a multiple of 5), so
 * the rounded payout reproduces them exactly too.
 *
 * The 8-row tables have no version on the server. Between 2026-08-15 20:31 and 2026-08-18 09:14
 * UTC production ran the tables in
 * `PLINKO_GOLD_TABLES_AUG_2026`: rounds from those days land on the same slots but paid from them.
 */
import { type PfFloat, type Ratio, ratio, toGram, toStars } from "../provablyFair.js";

export type PlinkoGoldRisk = "low" | "medium" | "high" | "extreme";
export type PlinkoGoldRows = 8 | 12 | 16;

export const PLINKO_GOLD_ROW_OPTIONS: readonly PlinkoGoldRows[] = [8, 12, 16];
/** The board a round without a `rows` field played. */
export const PLINKO_GOLD_DEFAULT_ROWS: PlinkoGoldRows = 8;
/** `PlinkoGoldPaidService.FloatsPerDrop(rows)`: the two balls' blocks, which a Gram drop draws and nothing more. */
export const plinkoGoldFloats = (rows: PlinkoGoldRows) => rows * 2;
/** `PlinkoGoldPaidService.FloatsPerStarsDrop(rows)`: a Stars drop adds the payout rounding float at index `2 × rows`. */
export const plinkoGoldStarsFloats = (rows: PlinkoGoldRows) => rows * 2 + 1;
/** `PlinkoGoldMath.BonusPegRow` and `BonusPegColumns`. */
export const PLINKO_GOLD_BONUS_PEG_ROW = 4;
export const PLINKO_GOLD_BONUS_PEG_COLUMNS = [0, 4] as const;
/** `PlinkoGoldMath.MaxWinStars`: one Stars drop, both balls together. */
export const PLINKO_GOLD_MAX_WIN_STARS = 10_000;
export const PLINKO_GOLD_MAX_WIN_GRAM = "1000";

/** `PlinkoGoldMath.Mirror`: the half from the edge to the middle cup, reflected. */
const mirror = (...half: string[]) => [...half, ...half.slice(0, -1).reverse()];

/** `PlinkoGoldMath.MultiplierTables`, slot 0 to `rows`. */
export const PLINKO_GOLD_TABLES: Record<PlinkoGoldRows, Record<PlinkoGoldRisk, string[]>> = {
  8: {
    low: ["5.2", "2.0", "1.0", "0.8", "0.4", "0.8", "1.0", "2.0", "5.2"],
    medium: ["11.6", "2.6", "1.0", "0.6", "0.4", "0.6", "1.0", "2.6", "11.6"],
    high: ["25.8", "3.8", "1.2", "0.2", "0.2", "0.2", "1.2", "3.8", "25.8"],
    extreme: mirror("60.2", "3.0", "0.2", "0.2", "0.2"),
  },
  12: {
    low: mirror("12.4", "5.4", "3.2", "1.0", "1.0", "0.8", "0.2"),
    medium: mirror("17.4", "4.8", "2.4", "2.0", "0.8", "0.6", "0.4"),
    high: mirror("75.6", "22.8", "6.6", "1.8", "0.6", "0.2", "0.2"),
    extreme: mirror("125.0", "33.4", "7.6", "1.6", "0.2", "0.2", "0.2"),
  },
  16: {
    low: mirror("13.8", "8.0", "4.0", "2.0", "1.0", "1.0", "1.0", "0.8", "0.4"),
    medium: mirror("18.6", "7.2", "2.0", "1.8", "1.8", "1.2", "1.2", "0.6", "0.2"),
    high: mirror("88.4", "56.8", "24.8", "9.8", "3.0", "1.0", "0.6", "0.2", "0.2"),
    extreme: mirror("250.0", "96.6", "35.8", "12.0", "3.4", "0.8", "0.2", "0.2", "0.2"),
  },
};

/** The 8-row tables live on production from 2026-08-15 20:31 to 2026-08-18 09:14 UTC. Extreme came later. */
export const PLINKO_GOLD_TABLES_AUG_2026: Record<Exclude<PlinkoGoldRisk, "extreme">, string[]> = {
  low: ["5.4", "2.4", "1.0", "0.8", "0.4", "0.8", "1.0", "2.4", "5.4"],
  medium: ["11.8", "3.0", "1.0", "0.6", "0.4", "0.6", "1.0", "3.0", "11.8"],
  high: ["27.6", "4.0", "1.2", "0.2", "0.2", "0.2", "1.2", "4.0", "27.6"],
};

export interface PlinkoGoldBall {
  path: ("L" | "R")[];
  /** One bit per row, set = right: the verify response's `rawPath` / `bonusRawPath`. */
  rawPath: number;
  slot: number;
  multiplier: string;
}

export interface PlinkoGoldOutcome {
  rows: PlinkoGoldRows;
  ball: PlinkoGoldBall;
  /** Whether the wagered ball touched a bonus peg (`bonusTriggered`). */
  bonusTriggered: boolean;
  golden: PlinkoGoldBall | null;
  /** Both balls together, one decimal place as the server stores it ("1.4", "26.0"). */
  multiplier: string;
  multiplierRatio: Ratio;
}

const popCount = (n: number) => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

const dropBall = (floats: PfFloat[], offset: number, rows: number, table: string[]): PlinkoGoldBall => {
  const path: ("L" | "R")[] = [];
  let rawPath = 0;
  for (let i = 0; i < rows; i++) {
    const right = floats[offset + i].value >= 0.5;
    path.push(right ? "R" : "L");
    if (right) rawPath |= 1 << i;
  }
  const slot = popCount(rawPath);
  return { path, rawPath, slot, multiplier: table[slot] };
};

/** `PlinkoGoldMath.IsBonusTriggered`: the column after the bonus row is 0 or 4. */
export const plinkoGoldBonusTriggered = (rawPath: number) => {
  const column = popCount(rawPath & ((1 << PLINKO_GOLD_BONUS_PEG_ROW) - 1));
  return (PLINKO_GOLD_BONUS_PEG_COLUMNS as readonly number[]).includes(column);
};

/** Tenths, the scale every Plinko Gold multiplier and their sum is stored at. */
const tenths = (m: string) => Number((ratio(m).num * 10n) / ratio(m).den);
const fromTenths = (t: number) => `${Math.floor(t / 10)}.${t % 10}`;

/**
 * Replays one paid drop from its `rows × 2` floats. `legacyTables` is the set an 8-row round was
 * paid from when it is not the current one; it is ignored on the other boards.
 */
export const plinkoGoldOutcome = (
  floats: PfFloat[],
  risk: PlinkoGoldRisk,
  rows: PlinkoGoldRows = PLINKO_GOLD_DEFAULT_ROWS,
  legacyTables?: Partial<Record<PlinkoGoldRisk, string[]>>,
): PlinkoGoldOutcome => {
  // The August tables had no Extreme; an Extreme round always reads today's.
  const table = (rows === 8 && legacyTables?.[risk] ? legacyTables : PLINKO_GOLD_TABLES[rows])[risk]!;
  const ball = dropBall(floats, 0, rows, table);
  const bonusTriggered = plinkoGoldBonusTriggered(ball.rawPath);
  const golden = bonusTriggered ? dropBall(floats, rows, rows, table) : null;
  const multiplier = fromTenths(tenths(ball.multiplier) + (golden ? tenths(golden.multiplier) : 0));
  return { rows, ball, bonusTriggered, golden, multiplier, multiplierRatio: ratio(multiplier) };
};

/**
 * `PlinkoGoldMath.StarsPayout`: the round's Stars, both balls together (`starsWon`), rounded on the
 * rounding float and capped at `MaxWinStars`. Without a float (a round from before ★1 bets) the
 * payout truncates, as it was paid.
 */
export const plinkoGoldStars = (bet: number, multiplier: string, rounding?: PfFloat): number => {
  const r = ratio(multiplier);
  const won = rounding ? toStars(bet, r, rounding) : Number((BigInt(bet) * r.num) / r.den);
  return Math.min(won, PLINKO_GOLD_MAX_WIN_STARS);
};

/** The golden ball's share (`bonusStarsWon`) on the same float: never more than the capped total. */
export const plinkoGoldBonusStars = (bet: number, goldenMultiplier: string, totalMultiplier: string, rounding?: PfFloat): number =>
  Math.min(plinkoGoldStars(bet, goldenMultiplier, rounding), plinkoGoldStars(bet, totalMultiplier, rounding));

/** The Gram payout, floored to the nanoton and capped at 1000 GRAM (`tonWon`). */
export const plinkoGoldGram = (bet: string, multiplier: string): string =>
  toGram(bet, ratio(multiplier), PLINKO_GOLD_MAX_WIN_GRAM);
