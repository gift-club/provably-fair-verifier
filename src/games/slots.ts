/**
 * Slots (Gifts of Zeus, Midnight Panda) for the public provably fair checker: an exact port of
 * the server's tumbling 5x5 grid, free spins included, so the checker shows the real round.
 *
 * Backend sources, read 2026-10-17:
 * - `Services/Games/SlotsMath.cs`: `Resolve`, `PlaySpin`, `DropAndRefill`, `PlayPick`, `PlayWalk`,
 *   `SymbolFromFloat`, `PayFor`, `StarsPayout`, `SlotsBonusRules`, and every frozen `SlotsRuleSet`
 *   (V1–V21, `ForRisk`, `ForVersion`). V7–V9 are the Gift boost sets (live from 2026-10-15), V10–V12 the
 *   sets with the two bonus games and V13–V15 their Gift boost twins. V16–V18 (V19–V21 boosted, live from
 *   2026-10-30) count Gifts on a spin's last grid, after every tumble, and let a free spin with 3+ Gifts
 *   add more free spins, up to a ceiling.
 * - `Services/Games/SlotsPaidService.cs`: `SpinAsync` (Stars), `SpinTonAsync` (Gram),
 *   `GetVerificationAsync` (floats regenerated up to the round's `FloatsConsumed`).
 * - `Services/Games/SlotsSkins.cs`: the designs (`zeus`, `panda`). A design is cosmetic: no
 *   maths, payout, seed or verify path reads it.
 *
 * Float order: the base grid takes 25 floats, column by column (col 0 rows 0–4, col 1, …). Each
 * tumble then refills, column by column, one float per removed cell, the new symbols stacked on
 * top. Then, from V10, the pick bonus (when 3+ pick symbols sit on that first grid; 9 floats) and
 * the board walk (3+ walk symbols; one float a roll, 3 to 5). Free spins follow in order, each
 * the same way. Only the base spin's first grid draws the bonus symbols (ids 9 and 10, the last
 * two weights); every refill and free-spin grid draws from the first nine weights only.
 * A Gift boost set (V7–V9, V13–V15) prices the spin at the bet plus 20% but counts every pay on
 * the bet, so the checker's bet is the stake before the boost. Every pay is a multiple of 0.2, so a Stars
 * payout is whole only at a bet that is a multiple of 5. A Stars spin therefore draws one float
 * more (read 2026-10-14, `SlotsMath.StarsFloatsToDraw`): the first one the round left unused, at
 * index `floatsConsumed`, which rounds the payout (`SlotsMath.StarsPayout`, stochastic rounding,
 * exact in expectation) before the `MaxWinStars` cap. A Gram payout is `TonPayoutCalculator.ToTon`
 * capped at `MaxWinTon` and draws no extra float. Rounds from before ★1 bets stored no rounding
 * float and floored, which lost nothing (every bet was a multiple of 5), so the rounded payout
 * reproduces them exactly too.
 *
 * How many floats a round uses depends on the round (`floatsConsumed`), so draw
 * `slotsMaxFloats(version)` floats (the server draws that many too) and pass them all in.
 *
 * Every multiplier is kept as whole tenths of a bet, so the sums are exact the way the server's
 * `decimal` is.
 */
import { toStars, type PfFloat, type Ratio } from "../provablyFair.js";

export const SLOTS_COLS = 5;
export const SLOTS_ROWS = 5;

/**
 * The caps a replayed round was played under: 10,000 Stars and 1,000 GRAM (V1's ★100 rounds were cut at
 * ★10,000). Since 2026-10-23 the server caps at ★2,500 / 25 GRAM through the tiers each risk offers, so no
 * newer round reaches either cap and checking it against these is still exact.
 */
export const SLOTS_MAX_WIN_STARS = 10000;
export const SLOTS_MAX_WIN_GRAM = "1000";

/** Stars tiers (`Slots:BetTiers`). */
export const SLOTS_STARS_BETS = [1, 5, 10, 20, 50, 100] as const;

export type SlotsRisk = "low" | "medium" | "high";
export type SlotsRuleSetVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;

/** A square of the board walk: `start` (square 0), `pay` (its value, in bets), `roll` (one more roll) or `double` (the next landing pays twice). */
export interface SlotsWalkSquare {
  kind: "start" | "pay" | "roll" | "double";
  value: number;
}

/** `SlotsBonusRules`: the pick bonus and the board walk every set from V10 plays. */
export interface SlotsBonusRules {
  pickSymbolId: number;
  walkSymbolId: number;
  trigger: number;
  /** What three of each kind pays, in bets, cheapest first. */
  pickPrizes: number[];
  /** How often each kind is the prize (not served to the app, but the draw needs them). */
  pickWeights: number[];
  walkBoard: SlotsWalkSquare[];
  walkRolls: number;
  walkMaxExtraRolls: number;
  walkDieFaces: number;
}

export interface SlotsRuleSet {
  version: SlotsRuleSetVersion;
  risk: SlotsRisk;
  /** What the set adds to a spin's price, in percent of the bet (20 on a Gift boost set). Pays always count on the bet. */
  boostPercent: number;
  /** The pick bonus and the board walk, from V10. */
  bonus?: SlotsBonusRules;
  minMatch: number;
  scatterId: number;
  freeSpinsTrigger: number;
  freeSpinsBase: number;
  freeSpinsPerExtraScatter: number;
  maxScattersCounted: number;
  /** From V16: Gifts are counted on a spin's last grid, after every tumble (`GiftsCountAfterTumbles`). */
  giftsCountAfterTumbles?: boolean;
  /** From V16: free spins a free spin with 3+ Gifts adds (`FreeSpinsRetrigger`); absent before. */
  freeSpinsRetrigger?: number;
  /** From V16: the most free spins one round plays, retriggers included (`MaxFreeSpins`). */
  maxFreeSpins?: number;
  maxCascades: number;
  /** Cap in whole bets. */
  maxWinMultiplier: number;
  symbolWeights: number[];
  thresholds: [number, number, number];
  /** payTenths[symbolId][column]: the pay in tenths of a bet (0.2 → 2). */
  payTenths: number[][];
  cascadeMultipliers: number[];
  /** When new rounds at its risk played this set, from the backend's doc comments; for a picker. */
  live: string;
}

const COMMON = {
  minMatch: 7,
  scatterId: 8,
  freeSpinsTrigger: 3,
  maxScattersCounted: 5,
  maxCascades: 15,
  thresholds: [7, 9, 11] as [number, number, number],
};

const BOOST = 20;

/** The pay tables the later sets share, in tenths of a bet (rows: symbols 0–7; columns: 7+, 9+, 11+). */
const PAY_HIGH = [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 40, 100], [20, 60, 200], [40, 120, 400]];
const PAY_MEDIUM = [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 40, 100], [20, 60, 200], [50, 120, 400]];
const PAY_LOW = [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [10, 20, 60], [12, 40, 100], [20, 60, 200], [50, 120, 400]];
const CASCADE_HIGH = [1, 2, 3, 5, 8, 12, 20];
const CASCADE_MEDIUM = [1, 2, 3, 4, 7, 9, 13];
const CASCADE_LOW = [1, 2, 3, 4, 5, 7, 8];

/** `SlotsRuleSet.BonusGames()`: the same bonus games on every set from V10. */
const sq = (kind: SlotsWalkSquare["kind"], value = 0): SlotsWalkSquare => ({ kind, value });
const BONUS_GAMES: SlotsBonusRules = {
  pickSymbolId: 9,
  walkSymbolId: 10,
  trigger: 3,
  pickPrizes: [2, 4, 8, 15],
  pickWeights: [40, 30, 20, 10],
  walkBoard: [
    sq("start"), sq("pay", 1), sq("pay", 2), sq("pay", 1),
    sq("roll"), sq("pay", 1), sq("pay", 2), sq("pay", 3),
    sq("pay", 10), sq("pay", 1), sq("pay", 3), sq("pay", 1),
    sq("double"), sq("pay", 1), sq("pay", 2), sq("pay", 4),
  ],
  walkRolls: 3,
  walkMaxExtraRolls: 2,
  walkDieFaces: 6,
};

/** `SlotsRuleSet.V1`–`V15`, copied literally. Published sets are frozen on the server. */
export const SLOTS_RULE_SETS: Record<SlotsRuleSetVersion, SlotsRuleSet> = {
  1: {
    ...COMMON,
    version: 1,
    risk: "high",
    boostPercent: 0,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    maxWinMultiplier: 1000,
    symbolWeights: [18, 17, 16, 15, 10, 9, 7, 5, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 30, 100], [20, 60, 200], [40, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 5, 8, 12, 20],
    live: "2026-09-20 – 2026-09-21",
  },
  2: {
    ...COMMON,
    version: 2,
    risk: "high",
    boostPercent: 0,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    maxWinMultiplier: 100,
    symbolWeights: [18, 17, 16, 15, 10, 9, 7, 5, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 40, 100], [20, 60, 200], [40, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 5, 8, 12, 20],
    live: "2026-09-21 until the bonus games shipped",
  },
  3: {
    ...COMMON,
    version: 3,
    risk: "medium",
    boostPercent: 0,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 100,
    symbolWeights: [20, 18, 16, 14, 10, 9, 7, 4, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 40, 100], [20, 60, 200], [50, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 4, 6, 9, 14],
    live: "2026-09-21 – 2026-09-23",
  },
  4: {
    ...COMMON,
    version: 4,
    risk: "low",
    boostPercent: 0,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 100,
    symbolWeights: [21, 18, 15, 14, 10, 9, 6, 4, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [10, 20, 60], [10, 40, 100], [20, 60, 200], [50, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 4, 5, 6, 8],
    live: "2026-09-21 – 2026-09-23",
  },
  5: {
    ...COMMON,
    version: 5,
    risk: "medium",
    boostPercent: 0,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 50,
    symbolWeights: [20, 18, 16, 14, 10, 9, 7, 4, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [8, 20, 60], [10, 40, 100], [20, 60, 200], [50, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 4, 7, 9, 13],
    live: "2026-09-23 until the bonus games shipped",
  },
  6: {
    ...COMMON,
    version: 6,
    risk: "low",
    boostPercent: 0,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 25,
    symbolWeights: [21, 18, 15, 14, 10, 9, 6, 4, 2],
    payTenths: [[2, 6, 20], [2, 6, 20], [4, 10, 30], [4, 10, 30], [10, 20, 60], [12, 40, 100], [20, 60, 200], [50, 120, 400]],
    cascadeMultipliers: [1, 2, 3, 4, 5, 7, 8],
    live: "2026-09-23 until the bonus games shipped",
  },
  7: {
    ...COMMON,
    version: 7,
    risk: "low",
    boostPercent: BOOST,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 25,
    symbolWeights: [2100, 1800, 1500, 1400, 1000, 900, 600, 400, 392],
    payTenths: PAY_LOW,
    cascadeMultipliers: CASCADE_LOW,
    live: "2026-10-15 until the bonus games shipped",
  },
  8: {
    ...COMMON,
    version: 8,
    risk: "medium",
    boostPercent: BOOST,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 50,
    symbolWeights: [2000, 1800, 1600, 1400, 1000, 900, 700, 400, 317],
    payTenths: PAY_MEDIUM,
    cascadeMultipliers: CASCADE_MEDIUM,
    live: "2026-10-15 until the bonus games shipped",
  },
  9: {
    ...COMMON,
    version: 9,
    risk: "high",
    boostPercent: BOOST,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    maxWinMultiplier: 100,
    symbolWeights: [1800, 1700, 1600, 1500, 1000, 900, 700, 500, 272],
    payTenths: PAY_HIGH,
    cascadeMultipliers: CASCADE_HIGH,
    live: "2026-10-15 until the bonus games shipped",
  },
  10: {
    ...COMMON,
    version: 10,
    risk: "high",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    maxWinMultiplier: 100,
    symbolWeights: [1800, 1700, 1600, 1500, 1000, 900, 700, 398, 200, 158, 158],
    payTenths: PAY_HIGH,
    cascadeMultipliers: CASCADE_HIGH,
    live: "the bonus games' launch until 2026-10-30",
  },
  11: {
    ...COMMON,
    version: 11,
    risk: "medium",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 50,
    symbolWeights: [2000, 1800, 1600, 1400, 1000, 900, 700, 285, 200, 158, 158],
    payTenths: PAY_MEDIUM,
    cascadeMultipliers: CASCADE_MEDIUM,
    live: "the bonus games' launch until 2026-10-30",
  },
  12: {
    ...COMMON,
    version: 12,
    risk: "low",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 25,
    symbolWeights: [2100, 1800, 1500, 1400, 1000, 900, 600, 275, 200, 158, 158],
    payTenths: PAY_LOW,
    cascadeMultipliers: CASCADE_LOW,
    live: "the bonus games' launch until 2026-10-30 (also every Spark round)",
  },
  13: {
    ...COMMON,
    version: 13,
    risk: "low",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 25,
    symbolWeights: [2100, 1800, 1500, 1400, 1000, 900, 600, 275, 364, 158, 158],
    payTenths: PAY_LOW,
    cascadeMultipliers: CASCADE_LOW,
    live: "the bonus games' launch until 2026-10-30",
  },
  14: {
    ...COMMON,
    version: 14,
    risk: "medium",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    maxWinMultiplier: 50,
    symbolWeights: [2000, 1800, 1600, 1400, 1000, 900, 700, 285, 300, 158, 158],
    payTenths: PAY_MEDIUM,
    cascadeMultipliers: CASCADE_MEDIUM,
    live: "the bonus games' launch until 2026-10-30",
  },
  15: {
    ...COMMON,
    version: 15,
    risk: "high",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    maxWinMultiplier: 100,
    symbolWeights: [1800, 1700, 1600, 1500, 1000, 900, 700, 398, 264, 158, 158],
    payTenths: PAY_HIGH,
    cascadeMultipliers: CASCADE_HIGH,
    live: "the bonus games' launch until 2026-10-30",
  },
  16: {
    ...COMMON,
    version: 16,
    risk: "high",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 5,
    maxFreeSpins: 50,
    maxWinMultiplier: 100,
    symbolWeights: [1800, 1700, 1600, 1500, 1000, 900, 700, 463, 160, 158, 158],
    payTenths: PAY_HIGH,
    cascadeMultipliers: CASCADE_HIGH,
    live: "since 2026-10-30",
  },
  17: {
    ...COMMON,
    version: 17,
    risk: "medium",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 3,
    maxFreeSpins: 30,
    maxWinMultiplier: 50,
    symbolWeights: [2000, 1800, 1600, 1400, 1000, 900, 700, 341, 155, 158, 158],
    payTenths: PAY_MEDIUM,
    cascadeMultipliers: CASCADE_MEDIUM,
    live: "since 2026-10-30",
  },
  18: {
    ...COMMON,
    version: 18,
    risk: "low",
    boostPercent: 0,
    bonus: BONUS_GAMES,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 2,
    maxFreeSpins: 20,
    maxWinMultiplier: 25,
    symbolWeights: [2100, 1800, 1500, 1400, 1000, 900, 600, 326, 150, 158, 158],
    payTenths: PAY_LOW,
    cascadeMultipliers: CASCADE_LOW,
    live: "since 2026-10-30 (also every Spark round)",
  },
  19: {
    ...COMMON,
    version: 19,
    risk: "low",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 5,
    freeSpinsPerExtraScatter: 1,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 2,
    maxFreeSpins: 20,
    maxWinMultiplier: 25,
    symbolWeights: [2100, 1800, 1500, 1400, 1000, 900, 600, 326, 246, 158, 158],
    payTenths: PAY_LOW,
    cascadeMultipliers: CASCADE_LOW,
    live: "since 2026-10-30",
  },
  20: {
    ...COMMON,
    version: 20,
    risk: "medium",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 7,
    freeSpinsPerExtraScatter: 1,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 3,
    maxFreeSpins: 30,
    maxWinMultiplier: 50,
    symbolWeights: [2000, 1800, 1600, 1400, 1000, 900, 700, 341, 212, 158, 158],
    payTenths: PAY_MEDIUM,
    cascadeMultipliers: CASCADE_MEDIUM,
    live: "since 2026-10-30",
  },
  21: {
    ...COMMON,
    version: 21,
    risk: "high",
    boostPercent: BOOST,
    bonus: BONUS_GAMES,
    freeSpinsBase: 10,
    freeSpinsPerExtraScatter: 2,
    giftsCountAfterTumbles: true,
    freeSpinsRetrigger: 5,
    maxFreeSpins: 50,
    maxWinMultiplier: 100,
    symbolWeights: [1800, 1700, 1600, 1500, 1000, 900, 700, 463, 195, 158, 158],
    payTenths: PAY_HIGH,
    cascadeMultipliers: CASCADE_HIGH,
    live: "since 2026-10-30",
  },
};

export const SLOTS_RULE_SET_VERSIONS: SlotsRuleSetVersion[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

/** `SlotsRuleSet.ForRisk`: the set new rounds at each risk play today (a Spark round plays Low). `ForRisk(risk, boost)` plays 13, 14, 15. */
export const SLOTS_CURRENT_BY_RISK: Record<SlotsRisk, SlotsRuleSetVersion> = { low: 18, medium: 17, high: 16 };
export const SLOTS_CURRENT_BOOSTED_BY_RISK: Record<SlotsRisk, SlotsRuleSetVersion> = { low: 19, medium: 20, high: 21 };

/** `SlotsRuleSet.PreVersioning`: rounds stored as 0 ran inline rules no numbered set replays. */
export const SLOTS_PRE_VERSIONING = 0;

/** `SlotsRuleSet.MostFreeSpins`: the biggest award, or with retriggers (V16 on) the set's ceiling. */
const mostFreeSpins = (r: SlotsRuleSet) =>
  r.freeSpinsRetrigger ? (r.maxFreeSpins ?? 0) : r.freeSpinsBase + r.freeSpinsPerExtraScatter * (r.maxScattersCounted - r.freeSpinsTrigger);

/** `SlotsRuleSet.MaxFloats`: the most floats one round under this set can consume (V1/V2 6,000; V10/V15 6,014; V16 20,414). */
export const slotsMaxFloats = (version: SlotsRuleSetVersion) => {
  const r = SLOTS_RULE_SETS[version];
  return (1 + mostFreeSpins(r)) *
    (SLOTS_COLS * SLOTS_ROWS * (1 + r.maxCascades)) + (r.bonus ? bonusMaxFloats(r.bonus) : 0);
};

/** `SlotsBonusRules.MaxFloats`: one for the prize, eight for the shuffle, one for every roll the walk can take. */
const bonusMaxFloats = (b: SlotsBonusRules) => SLOTS_PICK_ITEMS + b.walkRolls + b.walkMaxExtraRolls;

/** Items on the pick board: three of the prize kind and two of each other kind. */
export const SLOTS_PICK_ITEMS = 9;

/** Symbol names per design, ids 0–10 (8 is the Gift scatter; 9 and 10 are the pick and walk symbols, on V10 and later). From the app's en locale. */
export const SLOTS_SKINS = {
  zeus: {
    name: "Gifts of Zeus",
    symbols: ["Ruby", "Sapphire", "Emerald", "Topaz", "Moon", "Thunderbolt", "Laurel crown", "Temple", "Gift", "Seal", "Die"],
  },
  panda: {
    name: "Midnight Panda",
    symbols: ["Dumpling", "Candied hawthorn", "Mooncake", "Bubble tea", "Rice bowl panda", "Koi rider", "Moon panda", "Panda chef", "Gift", "Lantern", "Die"],
  },
} as const;
export type SlotsSkin = keyof typeof SLOTS_SKINS;

export interface SlotsWin {
  symbolId: number;
  count: number;
  /** Pay in bets before the tumble multiplier. */
  payout: number;
  /** [col, row] */
  positions: [number, number][];
}

export interface SlotsCascade {
  wins: SlotsWin[];
  removePositions: [number, number][];
  multiplier: number;
  /** Per column, top to bottom: the symbols that fell in. */
  newSymbols: number[][];
}

export interface SlotsSpin {
  /** grid[col][row], row 0 at the top. */
  grid: number[][];
  cascades: SlotsCascade[];
  /** The Gifts that count: the first grid's before V16, the last grid's (after every tumble) from V16. */
  scatterCount: number;
  /** What this spin paid, in bets. */
  multiplier: number;
  /** Free spins this free spin added by retriggering (V16 on); absent when it added none. */
  freeSpinsAdded?: number;
}

/** `SlotsPickBonus`: prize is an index into the pick prizes; reveals are the kinds the taps open, ending on the third of the prize kind. */
export interface SlotsPick {
  prize: number;
  multiplier: number;
  reveals: number[];
}

export interface SlotsWalkStep {
  roll: number;
  square: number;
  /** Bets, doubles included. */
  paid: number;
  doubled: boolean;
  extraRoll: boolean;
}

export interface SlotsWalk {
  multiplier: number;
  steps: SlotsWalkStep[];
}

export interface SlotsOutcome extends SlotsSpin {
  ruleSetVersion: SlotsRuleSetVersion;
  bonusTriggered: boolean;
  freeSpinsAwarded: number;
  freeSpins?: SlotsSpin[];
  baseMultiplier: number;
  /** What the free spins paid, in bets. */
  bonusMultiplier: number;
  /** The pick bonus, when 3+ pick symbols landed on the first grid (V10 on). */
  pick?: SlotsPick;
  /** The board walk, when 3+ walk symbols landed on the first grid (V10 on). */
  walk?: SlotsWalk;
  pickMultiplier: number;
  walkMultiplier: number;
  /** The round in bets after the cap. */
  totalMultiplier: number;
  /** The same, exact, for `toGram` / payouts. */
  totalRatio: Ratio;
  capped: boolean;
  tumbleCount: number;
  /** How many floats the round used (`FloatsConsumed`, what verify returns). */
  floatsConsumed: number;
}

const tenthsToNumber = (t: number) => t / 10;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * `SlotsMath.SymbolFromFloat(f, rules, withBonusSymbols)`: double maths, as the server does it. The
 * bonus symbols land only on the base spin's first grid (`withBonusSymbols`); a refill or free spin
 * rolls over the paying symbols and the Gift alone.
 */
export const slotsSymbolFromFloat = (f: number, rules: SlotsRuleSet, withBonusSymbols = true) => {
  const weights = rules.symbolWeights;
  const count = withBonusSymbols ? weights.length : rules.scatterId + 1;
  const roll = f * sum(weights.slice(0, count));
  let cumulative = 0;
  for (let i = 0; i < count; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return i;
  }
  return count - 1;
};

const payTenthsFor = (symbolId: number, count: number, rules: SlotsRuleSet) => {
  const t = rules.thresholds;
  if (count < t[0]) return 0;
  const column = count >= t[2] ? 2 : count >= t[1] ? 1 : 0;
  return rules.payTenths[symbolId][column];
};

class FloatReader {
  index = 0;
  constructor(private readonly floats: PfFloat[]) {}
  take() {
    if (this.index >= this.floats.length) throw new Error(`Slots ran out of floats after ${this.floats.length}: the round needs more to replay`);
    return this.floats[this.index++].value;
  }
}

const countOf = (grid: number[][], symbolId: number) => grid.reduce((n, col) => n + col.filter((s) => s === symbolId).length, 0);

const playSpin = (reader: FloatReader, freeSpinMultiplier: number | null, rules: SlotsRuleSet, firstGrid: boolean) => {
  const grid: number[][] = [];
  for (let col = 0; col < SLOTS_COLS; col++) {
    grid.push([]);
    for (let row = 0; row < SLOTS_ROWS; row++) grid[col].push(slotsSymbolFromFloat(reader.take(), rules, firstGrid));
  }

  const spin: SlotsSpin = { grid: grid.map((c) => [...c]), cascades: [], scatterCount: countOf(grid, rules.scatterId), multiplier: 0 };
  let tenths = 0;
  let multiplier = freeSpinMultiplier ?? 0;

  for (let cascade = 0; cascade < rules.maxCascades; cascade++) {
    const wins: SlotsWin[] = [];
    const remove: [number, number][] = [];
    const removeKeys = new Set<number>();
    let winTenths = 0;

    for (let symbolId = 0; symbolId < rules.payTenths.length; symbolId++) {
      const count = countOf(grid, symbolId);
      if (count < rules.minMatch) continue;
      const positions: [number, number][] = [];
      for (let col = 0; col < SLOTS_COLS; col++)
        for (let row = 0; row < SLOTS_ROWS; row++) if (grid[col][row] === symbolId) positions.push([col, row]);
      for (const p of positions) {
        const key = p[0] * SLOTS_ROWS + p[1];
        if (!removeKeys.has(key)) {
          removeKeys.add(key);
          remove.push(p);
        }
      }
      const pay = payTenthsFor(symbolId, count, rules);
      winTenths += pay;
      wins.push({ symbolId, count, payout: tenthsToNumber(pay), positions });
    }

    if (wins.length === 0) break;

    const step = freeSpinMultiplier !== null
      ? multiplier++
      : rules.cascadeMultipliers[Math.min(cascade, rules.cascadeMultipliers.length - 1)];

    tenths += winTenths * step;

    // DropAndRefill
    const newSymbols: number[][] = [];
    for (let col = 0; col < SLOTS_COLS; col++) {
      const survivors: number[] = [];
      for (let row = 0; row < SLOTS_ROWS; row++) if (!removeKeys.has(col * SLOTS_ROWS + row)) survivors.push(grid[col][row]);
      const empty = SLOTS_ROWS - survivors.length;
      const fresh: number[] = [];
      for (let i = 0; i < empty; i++) fresh.push(slotsSymbolFromFloat(reader.take(), rules, false));
      grid[col] = [...fresh, ...survivors];
      newSymbols.push(fresh);
    }

    spin.cascades.push({ wins, removePositions: remove, multiplier: step, newSymbols });
  }

  // Gifts never pay, so a tumble never clears one: the last grid holds every Gift that landed (V16 on).
  if (rules.giftsCountAfterTumbles) spin.scatterCount = countOf(grid, rules.scatterId);
  spin.multiplier = tenthsToNumber(tenths);
  return { spin, tenths };
};

/**
 * `SlotsMath.PlayPick`: the prize on one float from the pick weights, then a Fisher-Yates shuffle
 * of [p, p, p, a, a, b, b, c, c] from the last item down (8 floats, `j = min(floor(f * (i + 1)), i)`),
 * opened in order until the third of the prize kind. Always 9 floats.
 */
const playPick = (reader: FloatReader, bonus: SlotsBonusRules): SlotsPick => {
  const weights = bonus.pickWeights;
  const roll = reader.take() * sum(weights);
  let prize = weights.length - 1;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) {
      prize = i;
      break;
    }
  }

  const items: number[] = [prize, prize, prize];
  for (let kind = 0; kind < weights.length; kind++) if (kind !== prize) items.push(kind, kind);

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(reader.take() * (i + 1)), i);
    [items[i], items[j]] = [items[j], items[i]];
  }

  const reveals: number[] = [];
  let found = 0;
  for (const item of items) {
    reveals.push(item);
    if (item === prize && ++found === 3) break;
  }
  return { prize, multiplier: bonus.pickPrizes[prize], reveals };
};

/**
 * `SlotsMath.PlayWalk`: a token starts on square 0 and moves round the board by each roll of the die
 * (`min(floor(f * faces), faces - 1) + 1`, one float a roll). A pay square adds its value (twice after a
 * Double square), a Roll square adds a roll (at most `walkMaxExtraRolls` times), anything else does nothing.
 */
const playWalk = (reader: FloatReader, bonus: SlotsBonusRules): SlotsWalk => {
  const board = bonus.walkBoard;
  const steps: SlotsWalkStep[] = [];
  let position = 0;
  let rollsLeft = bonus.walkRolls;
  let extras = 0;
  let doubleNext = false;
  let multiplier = 0;

  while (rollsLeft > 0) {
    rollsLeft--;
    const die = Math.min(Math.floor(reader.take() * bonus.walkDieFaces), bonus.walkDieFaces - 1) + 1;
    position = (position + die) % board.length;
    const square = board[position];
    const step: SlotsWalkStep = { roll: die, square: position, paid: 0, doubled: false, extraRoll: false };

    const doubled = doubleNext;
    doubleNext = false;
    if (square.kind === "pay") {
      step.paid = square.value * (doubled ? 2 : 1);
      step.doubled = doubled;
    } else if (square.kind === "roll" && extras < bonus.walkMaxExtraRolls) {
      extras++;
      rollsLeft++;
      step.extraRoll = true;
    } else if (square.kind === "double") {
      doubleNext = true;
    }

    multiplier += step.paid;
    steps.push(step);
  }
  return { multiplier, steps };
};

/**
 * `SlotsMath.Resolve(floats, SlotsRuleSet.ForVersion(version))`. Pass at least the round's
 * floats (`slotsMaxFloats(version)` is always enough); throws if they run out.
 */
export const slotsOutcome = (floats: PfFloat[], version: SlotsRuleSetVersion): SlotsOutcome => {
  const rules = SLOTS_RULE_SETS[version];
  if (!rules) throw new Error(`Unknown Slots rule set version ${version}`);
  if (floats.length < SLOTS_COLS * SLOTS_ROWS) throw new Error(`Slots needs at least ${SLOTS_COLS * SLOTS_ROWS} floats for the first grid`);

  const reader = new FloatReader(floats);
  const base = playSpin(reader, null, rules, true);
  let bonusTenths = 0;
  let pick: SlotsPick | undefined;
  let walk: SlotsWalk | undefined;
  let freeSpinsAwarded = 0;
  let freeSpins: SlotsSpin[] | undefined;

  // The pick bonus, then the board walk, each on 3+ of its symbol on the first grid, before any free spin.
  if (rules.bonus) {
    if (countOf(base.spin.grid, rules.bonus.pickSymbolId) >= rules.bonus.trigger) pick = playPick(reader, rules.bonus);
    if (countOf(base.spin.grid, rules.bonus.walkSymbolId) >= rules.bonus.trigger) walk = playWalk(reader, rules.bonus);
  }

  if (base.spin.scatterCount >= rules.freeSpinsTrigger) {
    const extra = Math.min(base.spin.scatterCount, rules.maxScattersCounted) - rules.freeSpinsTrigger;
    freeSpinsAwarded = rules.freeSpinsBase + extra * rules.freeSpinsPerExtraScatter;
    freeSpins = [];
    let multiplier = 1;
    let spinsLeft = freeSpinsAwarded;
    while (spinsLeft > 0) {
      spinsLeft--;
      const s = playSpin(reader, multiplier, rules, false);
      multiplier += s.spin.cascades.length;
      bonusTenths += s.tenths;
      freeSpins.push(s.spin);
      // A retrigger (V16 on): 3+ Gifts on a free spin add spins, up to the set's ceiling.
      if (rules.freeSpinsRetrigger && s.spin.scatterCount >= rules.freeSpinsTrigger) {
        const added = Math.min(rules.freeSpinsRetrigger, mostFreeSpins(rules) - freeSpins.length - spinsLeft);
        if (added > 0) {
          spinsLeft += added;
          s.spin.freeSpinsAdded = added;
        }
      }
    }
  }

  const pickTenths = Math.round((pick?.multiplier ?? 0) * 10);
  const walkTenths = Math.round((walk?.multiplier ?? 0) * 10);
  const uncapped = base.tenths + pickTenths + walkTenths + bonusTenths;
  const capTenths = rules.maxWinMultiplier * 10;
  const totalTenths = Math.min(uncapped, capTenths);

  return {
    ruleSetVersion: version,
    grid: base.spin.grid,
    cascades: base.spin.cascades,
    scatterCount: base.spin.scatterCount,
    multiplier: base.spin.multiplier,
    bonusTriggered: freeSpins !== undefined,
    freeSpinsAwarded,
    freeSpins,
    baseMultiplier: base.spin.multiplier,
    bonusMultiplier: tenthsToNumber(bonusTenths),
    ...(pick ? { pick } : {}),
    ...(walk ? { walk } : {}),
    pickMultiplier: pick?.multiplier ?? 0,
    walkMultiplier: walk?.multiplier ?? 0,
    totalMultiplier: tenthsToNumber(totalTenths),
    totalRatio: { num: BigInt(totalTenths), den: 10n },
    capped: uncapped > capTenths,
    tumbleCount: base.spin.cascades.length + (freeSpins?.reduce((n, s) => n + s.cascades.length, 0) ?? 0),
    floatsConsumed: reader.index,
  };
};

/**
 * `SlotsMath.StarsPayout`: bet × multiplier rounded on the rounding float, capped at `MaxWinStars`.
 * With no float (a round from before ★1 bets) it floors, as that round was paid.
 */
export const slotsStarsPayout = (
  bet: number,
  outcome: Pick<SlotsOutcome, "totalRatio">,
  rounding?: PfFloat,
  maxWinStars = SLOTS_MAX_WIN_STARS,
) => {
  const won = rounding
    ? toStars(bet, outcome.totalRatio, rounding)
    : Number((BigInt(bet) * outcome.totalRatio.num) / outcome.totalRatio.den);
  return Math.min(won, maxWinStars);
};

/** The Stars rounding float: the first float the round left unused (`SlotsMath.StarsFloatsToDraw` draws it). */
export const slotsRoundingFloat = (floats: PfFloat[], outcome: Pick<SlotsOutcome, "floatsConsumed">): PfFloat | undefined =>
  floats[outcome.floatsConsumed];

/** Floats a round draws: a Gram spin the most it can need, a Stars spin one more for the rounding float. */
export const slotsFloatsFor = { stars: (version: SlotsRuleSetVersion) => slotsMaxFloats(version) + 1, gram: slotsMaxFloats };
