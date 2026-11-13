/**
 * Browser re-implementation of Gift Club's provably fair draw, for the public checker.
 *
 * Every function here mirrors a backend method and must stay byte-for-byte identical
 * to it. The sources, read on 2026-09-16:
 * - bytes and floats: `ProvablyFairEngine.GenerateBytes` / `BytesToFloat` — HMAC-SHA256
 *   keyed with the raw 32-byte server seed over "clientSeed:nonce:round", `round`
 *   counting 32-byte blocks; a float is b0/256 + b1/256² + b2/256³ + b3/256⁴.
 * - payout rounding: `PayoutCalculator.ToStars` — whole Stars plus one more when the
 *   rounding float is strictly below the fractional part. Done here with integers, the
 *   way .NET's `decimal` does it, never with doubles.
 * - Plinko `PlinkoPaidService.DropPaidAsync`, Keno `KenoMath.DrawNumbers`, Roll Over
 *   `RollOverPaidService`, Dice Duel `DiceDuelPaidService`, Coin Flip
 *   `CoinFlipPaidService`, Minefield / Mines Tower `PlaceMines`, Balloon Pump
 *   `BalloonPumpMath.DeriveBurstPump`, Higher/Lower `HigherLowerMath.ShuffleDeck` and its
 *   separate ":payout" stream.
 * - PvP Sea Battle fleets: `PvpSeaWarMath.DealFleet` / `NonceForLayout` (read 2026-09-18), and
 *   the first-mover and rounding floats of `PvpSeaWarService`.
 * - Gram (TON) rounds, read 2026-09-24: every game above takes Gram. A Gram round draws the
 *   same outcome floats as a Stars round and no payout-rounding float (the verify endpoints'
 *   `floatCount`: Plinko rows, Keno `KenoMath.DrawCount` 10, Dice Duel 4, Coin Flip 1 (a round that rode
 *   draws 2 + rides: see `pf/coin-flip.ts`); Roll Over
 *   still draws 2 and leaves the second unused). It pays `TonPayoutCalculator.ToTon` — bet ×
 *   multiplier floored to the nanoton — capped at the game's `MaxWinTon`, 1000 GRAM in every game.
 *   The rounding float comes after the outcome floats, so a Gram round's draw is the Stars draw.
 *
 * `provablyFair.test.ts` pins every game to vectors produced by the backend's own code
 * (see the server's own vector generator). If a game's draw changes on the server, the
 * vectors must be regenerated and this file updated in the same change.
 */

const encoder = new TextEncoder();

export const isHex = (value: string, bytes?: number) =>
  /^[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0 && (bytes === undefined || value.length === bytes * 2);

export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

export const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This browser does not support Web Crypto, which the checker needs.");
  return s;
};

export const sha256Hex = async (bytes: Uint8Array) =>
  bytesToHex(new Uint8Array(await subtle().digest("SHA-256", bytes as BufferSource)));

export const generateBytes = async (serverSeed: Uint8Array, clientSeed: string, nonce: number, byteCount: number) => {
  const key = await subtle().importKey("raw", serverSeed as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint8Array(byteCount);
  let offset = 0;
  for (let round = 0; offset < byteCount; round++) {
    const block = new Uint8Array(await subtle().sign("HMAC", key, encoder.encode(`${clientSeed}:${nonce}:${round}`)));
    const take = Math.min(32, byteCount - offset);
    out.set(block.subarray(0, take), offset);
    offset += take;
  }
  return out;
};

/** A float in [0, 1), kept alongside the 32-bit integer it came from for exact comparisons. */
export interface PfFloat {
  value: number;
  /** value = uint / 2^32 exactly. */
  uint: number;
}

export const generateFloats = async (serverSeed: Uint8Array, clientSeed: string, nonce: number, count: number): Promise<PfFloat[]> => {
  const bytes = await generateBytes(serverSeed, clientSeed, nonce, count * 4);
  return Array.from({ length: count }, (_, i) => {
    const o = i * 4;
    const uint = ((bytes[o] * 256 + bytes[o + 1]) * 256 + bytes[o + 2]) * 256 + bytes[o + 3];
    return {
      uint,
      value: bytes[o] / 256 + bytes[o + 1] / 65536 + bytes[o + 2] / 16777216 + bytes[o + 3] / 4294967296,
    };
  });
};

/** An exact rational multiplier, e.g. 1.09 = 109/100 or Roll Over's 95/(99 − t). */
export interface Ratio {
  num: bigint;
  den: bigint;
}

export const ratio = (decimal: string): Ratio => {
  if (!/^\d+(\.\d+)?$/.test(decimal)) throw new RangeError(`Not a plain decimal: "${decimal}"`);
  const [whole, frac = ""] = decimal.split(".");
  const den = 10n ** BigInt(frac.length);
  return { num: BigInt(whole) * den + BigInt(frac || "0"), den };
};

export const ratioToNumber = (r: Ratio) => Number(r.num) / Number(r.den);

/** PayoutCalculator.ToStars on an exact bet × multiplier. */
export const toStars = (bet: number, multiplier: Ratio, rounding: PfFloat): number => {
  const total = BigInt(bet) * multiplier.num;
  const base = total / multiplier.den;
  const remainder = total % multiplier.den;
  if (remainder === 0n) return Number(base);
  // float < remainder / den  ⇔  uint · den < remainder · 2^32
  return BigInt(rounding.uint) * multiplier.den < remainder * 4294967296n ? Number(base) + 1 : Number(base);
};

/** Whether a payout depended on the rounding float at all. */
export const isWholePayout = (bet: number, multiplier: Ratio) => (BigInt(bet) * multiplier.num) % multiplier.den === 0n;

// ---------------------------------------------------------------------------------------
// Gram (TON) payouts: `TonPayoutCalculator.ToTon` and each game's `MaxWinTon`.

/** The Gram tiers of every game the checker covers (`TonBetTiers` in appsettings.json). */
export const GRAM_BET_TIERS = ["0.1", "0.5", "1", "2", "3", "5", "10"] as const;
export type GramBet = (typeof GRAM_BET_TIERS)[number];

/** `MaxWinTon`, the single-win cap of every Gram game (appsettings.json). */
export const GRAM_MAX_WIN = "1000";

const NANO_PER_GRAM = 1_000_000_000n;

/** A decimal amount of Gram ("0.5") as whole nanotons, floored. */
export const toNano = (decimal: string): bigint => {
  const r = ratio(decimal);
  return (r.num * NANO_PER_GRAM) / r.den;
};

/** Nanotons back to the shortest decimal string: 182692307n → "0.182692307", 1900000000n → "1.9". */
export const formatNano = (nano: bigint): string => {
  const whole = nano / NANO_PER_GRAM;
  const frac = (nano % NANO_PER_GRAM).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
};

/**
 * A Gram payout in nanotons: min(ToTon(bet × multiplier), MaxWinTon). Exact integer maths;
 * the server's decimal rounds only at its 28th digit, far below the nanoton this floors to.
 */
export const toGramNano = (bet: string, multiplier: Ratio, maxWin: string = GRAM_MAX_WIN): bigint => {
  const b = ratio(bet);
  const nano = (b.num * multiplier.num * NANO_PER_GRAM) / (b.den * multiplier.den);
  const cap = toNano(maxWin);
  return nano < cap ? nano : cap;
};

/** The same payout as a decimal string, the way the app's history shows it. */
export const toGram = (bet: string, multiplier: Ratio, maxWin: string = GRAM_MAX_WIN) =>
  formatNano(toGramNano(bet, multiplier, maxWin));

/** Whether the cap, not bet × multiplier, set a Gram payout. */
export const isGramCapped = (bet: string, multiplier: Ratio, maxWin: string = GRAM_MAX_WIN) => {
  const b = ratio(bet);
  return b.num * multiplier.num * NANO_PER_GRAM > toNano(maxWin) * b.den * multiplier.den;
};

// ---------------------------------------------------------------------------------------
// Game tables, copied from the backend.

export type PlinkoRisk = "low" | "medium" | "high" | "extreme";

/**
 * Services/Boxes/PlinkoMultipliers.cs, every published version of it.
 *
 * A round is settled against the table that was live when it was played, so an old round
 * only verifies against its own version. The backend stamps each round with the version
 * it used and returns it from the verify endpoint as `payTableVersion`; rounds played
 * before the field existed are version 1.
 *
 * Version 2 retuned four tables — 12 and 16 rows, Low and High. Every 8-row table and
 * every Medium table is byte-for-byte the version-1 one. Version 3 (2026-11-01) is version 2
 * unchanged plus the Extreme boards, which no earlier version has. The
 * vectors pin every version.
 */
export type PlinkoPayTableVersion = 1 | 2 | 3;

/** The version rounds are played on today, and the default everywhere a version is optional. */
export const PLINKO_CURRENT_PAY_TABLE: PlinkoPayTableVersion = 3;

export const PLINKO_PAY_TABLE_VERSIONS: PlinkoPayTableVersion[] = [1, 2, 3];

type PlinkoBoardTables = Record<Exclude<PlinkoRisk, "extreme">, string[]> & { extreme?: string[] };

const PLINKO_V1_TABLES: Record<8 | 12 | 16, PlinkoBoardTables> = {
  8: {
    low: ["3.8", "1.6", "1.0", "1.0", "0.6", "1.0", "1.0", "1.6", "3.8"],
    medium: ["11.6", "2.2", "1.2", "0.8", "0.4", "0.8", "1.2", "2.2", "11.6"],
    high: ["29.0", "3.0", "1.4", "0.4", "0.2", "0.4", "1.4", "3.0", "29.0"],
  },
  12: {
    low: ["7.6", "4.2", "2.0", "1.8", "1.6", "0.6", "0.2", "0.6", "1.6", "1.8", "2.0", "4.2", "7.6"],
    medium: ["20.0", "5.0", "2.6", "2.0", "1.2", "0.6", "0.4", "0.6", "1.2", "2.0", "2.6", "5.0", "20.0"],
    high: ["38.0", "11.2", "6.0", "2.6", "0.8", "0.4", "0.2", "0.4", "0.8", "2.6", "6.0", "11.2", "38.0"],
  },
  16: {
    low: ["10.2", "5.2", "4.2", "3.0", "2.2", "1.4", "1.0", "0.6", "0.6", "0.6", "1.0", "1.4", "2.2", "3.0", "4.2", "5.2", "10.2"],
    medium: ["21.0", "8.2", "2.2", "2.2", "2.2", "1.4", "1.4", "0.6", "0.2", "0.6", "1.4", "1.4", "2.2", "2.2", "2.2", "8.2", "21.0"],
    high: ["107.4", "39.6", "9.8", "4.2", "3.0", "1.2", "1.0", "0.6", "0.2", "0.6", "1.0", "1.2", "3.0", "4.2", "9.8", "39.6", "107.4"],
  },
};

const PLINKO_V2_TABLES: Record<8 | 12 | 16, PlinkoBoardTables> = {
  8: {
    low: ["3.8", "1.6", "1.0", "1.0", "0.6", "1.0", "1.0", "1.6", "3.8"],
    medium: ["11.6", "2.2", "1.2", "0.8", "0.4", "0.8", "1.2", "2.2", "11.6"],
    high: ["29.0", "3.0", "1.4", "0.4", "0.2", "0.4", "1.4", "3.0", "29.0"],
  },
  12: {
    low: ["14.2", "6.4", "3.2", "1.2", "1.0", "1.0", "0.2", "1.0", "1.0", "1.2", "3.2", "6.4", "14.2"],
    medium: ["20.0", "5.0", "2.6", "2.0", "1.2", "0.6", "0.4", "0.6", "1.2", "2.0", "2.6", "5.0", "20.0"],
    high: ["85.0", "25.8", "7.2", "2.4", "0.6", "0.2", "0.2", "0.2", "0.6", "2.4", "7.2", "25.8", "85.0"],
  },
  16: {
    low: ["15.6", "9.0", "4.8", "2.6", "1.4", "1.0", "1.0", "1.0", "0.4", "1.0", "1.0", "1.0", "1.4", "2.6", "4.8", "9.0", "15.6"],
    medium: ["21.0", "8.2", "2.2", "2.2", "2.2", "1.4", "1.4", "0.6", "0.2", "0.6", "1.4", "1.4", "2.2", "2.2", "2.2", "8.2", "21.0"],
    high: ["99.4", "64.2", "28.2", "10.6", "3.4", "1.4", "0.6", "0.2", "0.2", "0.2", "0.6", "1.4", "3.4", "10.6", "28.2", "64.2", "99.4"],
  },
};

export const PLINKO_TABLES: Record<PlinkoPayTableVersion, Record<8 | 12 | 16, PlinkoBoardTables>> = {
  1: PLINKO_V1_TABLES,
  2: PLINKO_V2_TABLES,
  3: {
    8: { ...PLINKO_V2_TABLES[8], extreme: ["60.2", "4.0", "0.4", "0.2", "0.2", "0.2", "0.4", "4.0", "60.2"] },
    12: { ...PLINKO_V2_TABLES[12], extreme: ["125.0", "43.0", "9.8", "1.4", "0.2", "0.2", "0.2", "0.2", "0.2", "1.4", "9.8", "43.0", "125.0"] },
    16: {
      ...PLINKO_V2_TABLES[16],
      extreme: ["249.8", "100.2", "38.2", "13.4", "4.2", "1.0", "0.2", "0.2", "0.2", "0.2", "0.2", "1.0", "4.2", "13.4", "38.2", "100.2", "249.8"],
    },
  },
};

/** One board's table, on the current version unless an older round names its own. */
export const plinkoTable = (
  rows: 8 | 12 | 16,
  risk: PlinkoRisk,
  version: PlinkoPayTableVersion = PLINKO_CURRENT_PAY_TABLE,
): string[] => {
  const table = PLINKO_TABLES[version][rows][risk];
  if (!table) throw new Error(`Pay table ${version} has no ${risk} board`);
  return table;
};

/** Whether a version has this risk's boards: Extreme only from version 3. */
export const plinkoHasBoard = (risk: PlinkoRisk, version: PlinkoPayTableVersion) =>
  PLINKO_TABLES[version][8][risk] !== undefined;

/** Services/Games/KenoMath.cs PayTables */
export const KENO_TABLES: Record<number, Record<number, string>> = {
  1: { 1: "3.80" },
  2: { 1: "1.66", 2: "5.40" },
  3: { 1: "1.12", 2: "2.41", 3: "10.50" },
  4: { 1: "0.93", 2: "1.47", 3: "4.24", 4: "24.00" },
  5: { 1: "0.84", 2: "1.09", 3: "2.40", 4: "8.60", 5: "65.00" },
};

/** DiceDuel MarginMultipliers, appsettings.json */
export const DICE_DUEL_MARGINS = ["1.4", "1.4", "1.78", "1.78", "2.73", "2.73", "3.95", "3.95", "3.95", "3.95"];

/** CoinFlip WinMultiplier, appsettings.json */
export const COIN_FLIP_MULTIPLIER = "1.90";

/** RollOver HouseEdgePct, appsettings.json */
export const ROLL_OVER_EDGE_PCT = 5;

/** MinefieldService.DifficultySpecs */
export const MINEFIELD_SPECS = {
  easy: { tiles: 25, mines: 3, maxPicks: 15 },
  medium: { tiles: 25, mines: 5, maxPicks: 12 },
  hard: { tiles: 25, mines: 10, maxPicks: 7 },
} as const;

/** MinesTowerService specs: boxes per level, mines per level, levels. */
export const MINES_TOWER_SPECS = {
  easy: { boxes: 5, mines: 1, levels: 6 },
  medium: { boxes: 5, mines: 2, levels: 6 },
  hard: { boxes: 5, mines: 3, levels: 5 },
} as const;

/**
 * BalloonPump block, appsettings.json, and `BalloonPumpCurve`. A round is settled under the
 * curve stored on it, so the checker carries both: `sliding` is what the server runs now,
 * `flat` is what every round played before the curve changed was stored with (the
 * verification data reports those with an early survival rate of zero).
 *
 * Rates are whole percents, not fractions: the server turns the decimal rate of each pump
 * into a double, and `percent / 100` is the same correctly rounded double, where
 * `0.95 - 0.01 * k` computed in doubles is not.
 */
export type BalloonCurveId = "sliding" | "flat";
export interface BalloonCurve {
  targetRtp: number;
  earlySurvivalPct: number;
  survivalStepPct: number;
  survivalPct: number;
  maxPumps: number;
}
export const BALLOON_CURVES: Record<BalloonCurveId, BalloonCurve> = {
  sliding: { targetRtp: 0.95, earlySurvivalPct: 95, survivalStepPct: 1, survivalPct: 89, maxPumps: 35 },
  flat: { targetRtp: 0.95, earlySurvivalPct: 0, survivalStepPct: 0, survivalPct: 90, maxPumps: 20 },
};

const balloonIsFlat = (c: BalloonCurve) => c.survivalStepPct <= 0 || c.earlySurvivalPct <= c.survivalPct;

/** BalloonPumpCurve.SurvivalAt, in whole percent. */
export const balloonSurvivalPct = (c: BalloonCurve, pump: number) =>
  balloonIsFlat(c) ? c.survivalPct : Math.max(c.survivalPct, c.earlySurvivalPct - c.survivalStepPct * (pump - 1));

/**
 * HigherLowerMath.Multipliers — rule set 1, the fixed ladder. Frozen: rounds dealt before
 * 2026-09-24 (`ruleSetVersion` 1 in the verify response) settle and verify on it.
 */
export const HIGHER_LOWER_MULTIPLIERS = ["1.2348", "1.6684", "2.2564", "3.0470", "4.1159", "5.5599"];

// ---------------------------------------------------------------------------------------
// Outcomes. Each takes the floats for the round and returns what the server derived.

/**
 * The path and the slot are the same on every version — only the table the slot is read
 * from changed. `version` is the round's `payTableVersion` from the verify endpoint.
 */
export const plinkoOutcome = (
  floats: PfFloat[],
  rows: 8 | 12 | 16,
  risk: PlinkoRisk,
  version: PlinkoPayTableVersion = PLINKO_CURRENT_PAY_TABLE,
) => {
  const path: ("L" | "R")[] = [];
  let slot = 0;
  for (let i = 0; i < rows; i++) {
    const right = floats[i].value >= 0.5;
    path.push(right ? "R" : "L");
    if (right) slot++;
  }
  const multiplier = plinkoTable(rows, risk, version)[slot];
  return { path, slot, multiplier, roundingFloat: floats[rows] };
};

export const kenoOutcome = (floats: PfFloat[], picks: number[]) => {
  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  for (let i = 0; i < 10; i++) {
    const span = 40 - i;
    const j = i + Math.min(Math.floor(floats[i].value * span), span - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const drawn = pool.slice(0, 10).sort((a, b) => a - b);
  const hits = picks.filter((p) => drawn.includes(p)).length;
  const multiplier = KENO_TABLES[picks.length]?.[hits];
  return { drawn, hits, multiplier, roundingFloat: floats[10] };
};

export const rollOverOutcome = (floats: PfFloat[], threshold: number) => {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 98) {
    throw new RangeError(`Roll Over threshold must be a whole number from 0 to 98, got ${threshold}`);
  }
  const roll = Math.floor(floats[0].value * 100);
  const win = roll > threshold;
  const multiplier: Ratio = { num: BigInt(100 - ROLL_OVER_EDGE_PCT), den: BigInt(99 - threshold) };
  return { roll, win, multiplier, roundingFloat: floats[1] };
};

export const diceDuelOutcome = (floats: PfFloat[]) => {
  const die = (f: PfFloat) => Math.trunc(f.value * 6) + 1;
  const you = [die(floats[0]), die(floats[1])];
  const house = [die(floats[2]), die(floats[3])];
  const margin = you[0] + you[1] - (house[0] + house[1]);
  const result = margin > 0 ? "win" : margin === 0 ? "tie" : "loss";
  const multiplier =
    result === "win" ? DICE_DUEL_MARGINS[Math.min(margin - 1, DICE_DUEL_MARGINS.length - 1)] : result === "tie" ? "1.0" : "0";
  return { you, house, margin, result, multiplier, roundingFloat: floats[4] };
};

export const coinFlipOutcome = (floats: PfFloat[]) => ({
  side: floats[0].value >= 0.5 ? ("heads" as const) : ("tails" as const),
  multiplier: COIN_FLIP_MULTIPLIER,
  roundingFloat: floats[1],
});

/** Partial Fisher–Yates that swaps each pick to the end — Minefield's and Mines Tower's PlaceMines. */
export const placeMines = (floats: PfFloat[], start: number, tiles: number, mines: number) => {
  const positions = Array.from({ length: tiles }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < mines; i++) {
    const remaining = tiles - i;
    let idx = Math.trunc(floats[start + i].value * remaining);
    if (idx >= remaining) idx = remaining - 1;
    out.push(positions[idx]);
    [positions[idx], positions[remaining - 1]] = [positions[remaining - 1], positions[idx]];
  }
  return out;
};

export const minefieldOutcome = (floats: PfFloat[], difficulty: keyof typeof MINEFIELD_SPECS) => {
  const spec = MINEFIELD_SPECS[difficulty];
  return { mines: placeMines(floats, 0, spec.tiles, spec.mines), roundingFloat: floats[spec.mines] };
};

export const minesTowerOutcome = (floats: PfFloat[], difficulty: keyof typeof MINES_TOWER_SPECS) => {
  const spec = MINES_TOWER_SPECS[difficulty];
  const levels: number[][] = [];
  for (let l = 0; l < spec.levels; l++) levels.push(placeMines(floats, l * spec.mines, spec.boxes, spec.mines));
  return { levels, roundingFloat: floats[spec.mines * spec.levels] };
};

/** BalloonPumpMath.DeriveBurstPump. `maxPumps + 1` means the round can only end at the ceiling. */
export const balloonBurstPump = (roll: number, curve: BalloonCurve = BALLOON_CURVES.sliding) => {
  if (balloonIsFlat(curve)) {
    let r = roll;
    if (Number.isNaN(r) || r <= 0) r = Number.MIN_VALUE;
    if (r >= 1) r = 1 - 1e-12;
    let n = Math.floor(Math.log(r) / Math.log(curve.survivalPct / 100)) + 1;
    if (n < 1) n = 1;
    return Math.min(n, curve.maxPumps + 1);
  }
  const r = Number.isNaN(roll) || roll < 0 ? 0 : roll;
  // Cumulative survival in doubles, multiplied in pump order, exactly as the server does.
  let survival = 1;
  for (let n = 1; n <= curve.maxPumps; n++) {
    survival *= balloonSurvivalPct(curve, n) / 100;
    if (r >= survival) return n;
  }
  return curve.maxPumps + 1;
};

const fourDecimals = (units: bigint) => `${units / 10000n}.${String(units % 10000n).padStart(4, "0")}`;

/**
 * BalloonPumpMath.BuildMultiplierTable: rtp over the chance of surviving n pumps, floored to
 * four decimals. Index 0 is pump 1. The flat curve goes through doubles and the sliding one
 * through exact decimals, because that is how the server builds each of them.
 */
export const balloonLadder = (curve: BalloonCurve = BALLOON_CURVES.sliding): string[] => {
  if (balloonIsFlat(curve)) {
    return Array.from({ length: curve.maxPumps }, (_, i) => {
      const raw = curve.targetRtp / Math.pow(curve.survivalPct / 100, i + 1);
      // Integer ten-thousandths, formatted by hand: toFixed would round the binary value.
      return fourDecimals(BigInt(Math.round((Math.floor(raw * 10000) / 10000) * 10000)));
    });
  }
  const rtp = ratio(String(curve.targetRtp));
  let num = 1n; // survival = num / den
  let den = 1n;
  return Array.from({ length: curve.maxPumps }, (_, i) => {
    num *= BigInt(balloonSurvivalPct(curve, i + 1));
    den *= 100n;
    return fourDecimals((rtp.num * den * 10000n) / (rtp.den * num));
  });
};

export const balloonPumpOutcome = (floats: PfFloat[], curve: BalloonCurve = BALLOON_CURVES.sliding) => ({
  burstPump: balloonBurstPump(floats[0].value, curve),
  roundingFloat: floats[1],
});

export const SUITS = ["♥", "♦", "♣", "♠"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const cardLabel = (index: number) => `${RANKS[index % 13]}${SUITS[Math.floor(index / 13)]}`;

export const higherLowerDeck = (floats: PfFloat[]) => {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1, f = 0; i > 0; i--, f++) {
    const j = Math.min(Math.trunc(floats[f].value * (i + 1)), i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

/**
 * Higher / Lower rule set 2, per-call odds with the edge taken once (`HigherLowerMath`, read
 * 2026-09-24). Counted over the cards not yet dealt, ties left out: the round's first call
 * (nothing won yet) pays floor(9500 × (winners + losers) / winners) ten-thousandths, and every
 * later call is fair, floor(10000 × (winners + losers) / winners). A call no unseen card can lose
 * is a skip, and a side no unseen card can win is refused. The running multiplier is the product
 * floored to 4dp, capped at 100×. All integer maths in ten-thousandths, as the server does it.
 */
export const HIGHER_LOWER_RTP_BP = 9500;
export const HIGHER_LOWER_MAX_MULTIPLIER = 100;
const HL_SCALE = 10_000;

export type HigherLowerOutcome = "Win" | "Loss" | "Tie" | "Skip";

export interface HigherLowerStep {
  card: number;
  nextCard: number;
  call: "H" | "L";
  outcome: HigherLowerOutcome;
  /** The call's multiplier as a 4dp decimal string ("1" on a skip). */
  callMultiplier: string;
  /** The running multiplier after the call ("0" once lost). */
  multiplierAfter: string;
}

export interface HigherLowerReplay {
  steps: HigherLowerStep[];
  /** Calls won. */
  rounds: number;
  lost: boolean;
  /** The running multiplier as a 4dp decimal string. */
  multiplier: string;
  /** 1-based index of a call the server would have refused (no card could win it), if any. */
  refusedAt?: number;
}

const hlRank = (card: number) => (card % 13) + 2;
const hlDecimal = (tenThousandths: number) =>
  `${Math.trunc(tenThousandths / HL_SCALE)}.${String(tenThousandths % HL_SCALE).padStart(4, "0")}`.replace(/\.?0+$/, "");

/** Unseen cards above, below and level with deck[index], from the cards dealt up to it. */
export const higherLowerUnseen = (deck: number[], index: number) => {
  const unseen = new Array<number>(13).fill(4);
  for (let i = 0; i <= index; i++) unseen[hlRank(deck[i]) - 2]--;
  const current = hlRank(deck[index]);
  let above = 0;
  let below = 0;
  unseen.forEach((n, r) => {
    if (r + 2 > current) above += n;
    else if (r + 2 < current) below += n;
  });
  return { above, below, ties: unseen[current - 2] };
};

/**
 * HigherLowerMath.CallMultiplier in ten-thousandths: null if the side can't win, 1× if sure. Only
 * the first call carries the edge; later calls are priced fair.
 */
export const higherLowerCallMultiplier = (winners: number, losers: number, firstCall: boolean): number | null =>
  winners === 0
    ? null
    : losers === 0
      ? HL_SCALE
      : Math.floor(((firstCall ? HIGHER_LOWER_RTP_BP : HL_SCALE) * (winners + losers)) / winners);

/** HigherLowerMath.Replay: a rule-set-2 round rebuilt from its deck and its calls ("HLH…"). */
export const higherLowerReplay = (deck: number[], calls: string): HigherLowerReplay => {
  const steps: HigherLowerStep[] = [];
  let index = 0;
  let rounds = 0;
  let running = HL_SCALE;
  let lost = false;

  for (const [i, ch] of [...calls.toUpperCase().replace(/[^HL]/g, "")].entries()) {
    if (lost || index + 1 >= deck.length || running >= HIGHER_LOWER_MAX_MULTIPLIER * HL_SCALE) break;
    const call = ch as "H" | "L";
    const { above, below } = higherLowerUnseen(deck, index);
    const [winners, losers] = call === "H" ? [above, below] : [below, above];
    const m = higherLowerCallMultiplier(winners, losers, rounds === 0);
    if (m === null) return { steps, rounds, lost, multiplier: hlDecimal(running), refusedAt: i + 1 };

    const current = hlRank(deck[index]);
    const next = hlRank(deck[index + 1]);
    let outcome: HigherLowerOutcome;
    if (next === current) outcome = "Tie";
    else if (losers === 0) outcome = "Skip";
    else if (call === "H" ? next > current : next < current) {
      outcome = "Win";
      rounds++;
      running = Math.min(Math.floor((running * m) / HL_SCALE), HIGHER_LOWER_MAX_MULTIPLIER * HL_SCALE);
    } else {
      outcome = "Loss";
      lost = true;
    }

    steps.push({
      card: deck[index],
      nextCard: deck[index + 1],
      call,
      outcome,
      callMultiplier: hlDecimal(m),
      multiplierAfter: lost ? "0" : hlDecimal(running),
    });
    index++;
  }

  return { steps, rounds, lost, multiplier: lost ? "0" : hlDecimal(running) };
};

// ---------------------------------------------------------------------------------------
// PvP Sea Battle. Unlike the solo games a match reads several nonces: the base nonce carries
// who shoots first (float 0) and the payout rounding draw (float 1), and every fleet
// layout has a nonce of its own. Mirrors `PvpSeaWarMath.DealFleet` and
// `PvpSeaWarService.CreatorShootsFirst` / `CalculateWinnings`.

/**
 * PvpSeaWarOptions: BoardSize, Fleet, MaxShuffles, HouseEdgePercent; PvpSeaWarMath.DealAttempts.
 * MaxShuffles was 5 until 2026-10-07, when it became 99 (read 2026-10-07): shuffling is
 * effectively unlimited in the app, and the cap only bounds the layouts committed up front.
 */
export const SEA_WAR = {
  boardSize: 7,
  fleet: [4, 3, 2, 2],
  maxShuffles: 99,
  dealAttempts: 4,
  /** The winner is paid ToStars(bet × 2 × (1 − 0.05)) = bet × 1.90. */
  winMultiplier: "1.90",
} as const;

export type SeaWarRole = "creator" | "opponent";

/** One dealt ship. Cells are row × boardSize + col, ascending. */
export interface SeaWarShip {
  index: number;
  size: number;
  cells: number[];
  horizontal: boolean;
}

/** PvpSeaWarMath.NonceForLayout: layouts start one past the base nonce and interleave the roles. */
export const seaWarLayoutNonce = (baseNonce: number, role: SeaWarRole, layoutIndex: number) =>
  baseNonce + 1 + 2 * layoutIndex + (role === "creator" ? 0 : 1);

/** PvpSeaWarMath.LegalPlacements: horizontal by row then column, then vertical; a one-cell ship once. */
export const seaWarLegalPlacements = (size: number, boardSize: number, blocked: boolean[]) => {
  const out: { cells: number[]; horizontal: boolean }[] = [];
  for (let row = 0; row < boardSize; row++)
    for (let col = 0; col + size <= boardSize; col++) {
      const cells = Array.from({ length: size }, (_, k) => row * boardSize + col + k);
      if (!cells.some((c) => blocked[c])) out.push({ cells, horizontal: true });
    }
  if (size === 1) return out;
  for (let row = 0; row + size <= boardSize; row++)
    for (let col = 0; col < boardSize; col++) {
      const cells = Array.from({ length: size }, (_, k) => (row + k) * boardSize + col);
      if (!cells.some((c) => blocked[c])) out.push({ cells, horizontal: false });
    }
  return out;
};

/** Blocks a ship's cells and their eight neighbours: ships never touch, not even at a corner. */
const blockWithHalo = (blocked: boolean[], cells: number[], boardSize: number) => {
  for (const cell of cells) {
    const row = Math.floor(cell / boardSize);
    const col = cell % boardSize;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) blocked[r * boardSize + c] = true;
      }
  }
};

/**
 * PvpSeaWarMath.DealFleet(floats, …): ships in fleet order, one float each picking
 * min(floor(f × count), count − 1) among the legal placements. An attempt that leaves a
 * ship no room is discarded and the next fleet.length floats are used.
 */
export const seaWarDealFromFloats = (
  floats: PfFloat[],
  boardSize: number = SEA_WAR.boardSize,
  fleet: readonly number[] = SEA_WAR.fleet,
): SeaWarShip[] => {
  if (floats.length < fleet.length * SEA_WAR.dealAttempts) throw new Error("Not enough floats for a Sea Battle deal.");
  for (let attempt = 0; attempt < SEA_WAR.dealAttempts; attempt++) {
    const blocked = new Array<boolean>(boardSize * boardSize).fill(false);
    const ships: SeaWarShip[] = [];
    for (let i = 0; i < fleet.length; i++) {
      const placements = seaWarLegalPlacements(fleet[i], boardSize, blocked);
      if (placements.length === 0) break;
      const f = floats[attempt * fleet.length + i].value;
      const pick = placements[Math.min(Math.trunc(f * placements.length), placements.length - 1)];
      ships.push({ index: i, size: fleet[i], cells: pick.cells, horizontal: pick.horizontal });
      blockWithHalo(blocked, pick.cells, boardSize);
    }
    if (ships.length === fleet.length) return ships;
  }
  throw new Error("No legal fleet within the committed deal attempts.");
};

/**
 * Both fleets of a Sea Battle match at one layout index (0 is the first deal, each shuffle
 * moves one forward), plus the base-nonce draws: float 0 decides who shoots first
 * (creator when below 0.5) and float 1 settles the payout rounding.
 */
export const seaWarDeal = async (serverSeed: Uint8Array, clientSeed: string, baseNonce: number, layoutIndex: number) => {
  const perLayout = SEA_WAR.fleet.length * SEA_WAR.dealAttempts;
  const [base, creatorFloats, opponentFloats] = await Promise.all([
    generateFloats(serverSeed, clientSeed, baseNonce, 2),
    generateFloats(serverSeed, clientSeed, seaWarLayoutNonce(baseNonce, "creator", layoutIndex), perLayout),
    generateFloats(serverSeed, clientSeed, seaWarLayoutNonce(baseNonce, "opponent", layoutIndex), perLayout),
  ]);
  return {
    creator: seaWarDealFromFloats(creatorFloats),
    opponent: seaWarDealFromFloats(opponentFloats),
    creatorShootsFirst: base[0].value < 0.5,
    firstMoverFloat: base[0],
    roundingFloat: base[1],
  };
};

/** How many floats each game draws for one Stars round, including its rounding float. */
export const floatsFor = {
  plinko: (rows: number) => rows + 1,
  keno: () => 11,
  rollOver: () => 2,
  diceDuel: () => 5,
  coinFlip: () => 2,
  minefield: (d: keyof typeof MINEFIELD_SPECS) => MINEFIELD_SPECS[d].mines + 1,
  minesTower: (d: keyof typeof MINES_TOWER_SPECS) => MINES_TOWER_SPECS[d].mines * MINES_TOWER_SPECS[d].levels + 1,
  balloonPump: () => 2,
  higherLower: () => 51,
};

/**
 * How many floats each game draws for one Gram round: the outcome floats and no rounding
 * float, as each verify endpoint's `floatCount` reports them. Roll Over is the exception:
 * it draws its second float anyway and leaves it unused. Higher / Lower's ":payout" stream
 * only settles Stars.
 */
export const gramFloatsFor: typeof floatsFor = {
  plinko: (rows: number) => rows,
  keno: () => 10,
  rollOver: () => 2,
  diceDuel: () => 4,
  coinFlip: () => 1,
  minefield: (d: keyof typeof MINEFIELD_SPECS) => MINEFIELD_SPECS[d].mines,
  minesTower: (d: keyof typeof MINES_TOWER_SPECS) => MINES_TOWER_SPECS[d].mines * MINES_TOWER_SPECS[d].levels,
  balloonPump: () => 1,
  higherLower: () => 51,
};

/**
 * The worked example the checker opens with: the first case in provablyFair.vectors.json,
 * copied here so the page does not bundle the whole vector file. A test keeps them equal.
 */
export const EXAMPLE_ROUND = {
  serverSeed: "0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff0",
  serverSeedHash: "afa880ca0c7da502fc32ab284cf70852ef7c5540204e4215c2a1617074ca7905",
  clientSeed: "gift-club-demo",
  nonce: 0,
};
