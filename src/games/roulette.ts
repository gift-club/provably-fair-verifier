/**
 * Roulette for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-12 (RouletteMath.cs):
 * - `DrawPaid` / `PocketFromFloats`: the round's floats in order are candidates, each read as its
 *   32-bit integer (`PfFloat.uint`, the float × 2³²). The pocket is `uint mod 37` of the first
 *   candidate below `RejectionLimit` (2³² − 2³² mod 37 = 4,294,967,289; the 7 values at or above it
 *   are skipped, so every pocket is exactly 1/37). The float straight after the accepted candidate
 *   is the Stars rounding float. `DrawPaid` reads 8 floats and, if all of them are rejected, a
 *   longer prefix of the same stream, 8 more at a time. Stars and Gram spins draw the same way.
 * - `BuildCatalogue`: the 157 legal bets and their keys (`straight:17`, `split:17,20`,
 *   `street:13,14,15`, `trio:0,1,2`, `corner:17,18,20,21`, `firstfour:0,1,2,3`,
 *   `sixline:13,…,18`, `dozen:1`–`3`, `column:1`–`3`, `red`, `black`, `odd`, `even`, `low`, `high`).
 * - `RoulettePayTable.V1`: total return per unit staked, stake included, by pockets covered.
 * - `StarsPayout`: Σ stake × m_k over the bets covering the pocket, `PayoutCalculator.ToStars` once
 *   on the rounding float, capped at `MaxWinStars` (a layout that could pay more is refused before
 *   the stake is taken, so the cap never binds). `TonPayout`: the same exact return floored to the
 *   nanoton (`TonPayoutCalculator.ToTon`), capped at `MaxWinTon`.
 * Pinned by `roulette.test.ts` against `scripts/pf-vectors/roulette.cs`.
 */
import { formatNano, ratio, toNano, toStars, type PfFloat, type Ratio } from "../provablyFair.js";

export const ROULETTE_POCKETS = 37;

/** RouletteMath.RejectionLimit. */
export const ROULETTE_REJECTION_LIMIT = 4294967296 - (4294967296 % ROULETTE_POCKETS);

/** Floats `DrawPaid` reads at a time. */
export const ROULETTE_FLOAT_BLOCK = 8;

/** RouletteMath.RedPockets. */
export const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

/** RoulettePayTable.V1, by pockets covered; the only table so far. */
export const ROULETTE_PAY_TABLE: Record<number, string> = {
  1: "35.15",
  2: "17.57",
  3: "11.71",
  4: "8.78",
  6: "5.85",
  12: "2.92",
  18: "1.95",
};

/** RouletteOptions.MaxWinStars and MaxWinTon. */
export const ROULETTE_MAX_WIN_STARS = 10000;
export const ROULETTE_MAX_WIN_GRAM = "1000";

export type RoulettePocketColour = "green" | "red" | "black";

export const roulettePocketColour = (n: number): RoulettePocketColour =>
  n === 0 ? "green" : ROULETTE_RED.includes(n) ? "red" : "black";

/** RouletteMath.BuildCatalogue: every legal bet's key and the pockets it covers, ascending. */
const buildCatalogue = (): Map<string, number[]> => {
  const bets = new Map<string, number[]>();
  const add = (kind: string, pockets: number[], key?: string) => {
    const sorted = [...pockets].sort((a, b) => a - b);
    bets.set(key ?? `${kind}:${sorted.join(",")}`, sorted);
  };
  const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

  for (let n = 0; n <= 36; n++) add("straight", [n]);
  for (let r = 0; r < 12; r++) {
    for (let c = 1; c <= 3; c++) {
      const n = 3 * r + c;
      if (c < 3) add("split", [n, n + 1]);
      if (r < 11) add("split", [n, n + 3]);
      if (c < 3 && r < 11) add("corner", [n, n + 1, n + 3, n + 4]);
    }
    add("street", [3 * r + 1, 3 * r + 2, 3 * r + 3]);
    if (r < 11) add("sixline", range(3 * r + 1, 6));
  }
  add("split", [0, 1]);
  add("split", [0, 2]);
  add("split", [0, 3]);
  add("trio", [0, 1, 2]);
  add("trio", [0, 2, 3]);
  add("firstfour", [0, 1, 2, 3]);
  for (let d = 1; d <= 3; d++) add("dozen", range(12 * (d - 1) + 1, 12), `dozen:${d}`);
  for (let c = 1; c <= 3; c++) add("column", range(0, 12).map((r) => 3 * r + c), `column:${c}`);
  const numbers = range(1, 36);
  add("red", ROULETTE_RED, "red");
  add("black", numbers.filter((n) => !ROULETTE_RED.includes(n)), "black");
  add("odd", numbers.filter((n) => n % 2 === 1), "odd");
  add("even", numbers.filter((n) => n % 2 === 0), "even");
  add("low", range(1, 18), "low");
  add("high", range(19, 18), "high");
  return bets;
};

export const ROULETTE_BETS: ReadonlyMap<string, number[]> = buildCatalogue();

/** RouletteMath.PocketFromFloats: the first accepted candidate and the float after it, or null. */
export const roulettePocketFromFloats = (floats: PfFloat[]) => {
  for (let i = 0; i < floats.length - 1; i++) {
    if (floats[i].uint < ROULETTE_REJECTION_LIMIT) {
      return { pocket: floats[i].uint % ROULETTE_POCKETS, candidateIndex: i, roundingFloat: floats[i + 1] };
    }
  }
  return null;
};

/** One bet of a layout, as the checker reads it. */
export interface RouletteBetInput {
  key: string;
  stake: string;
}

/**
 * Bets from free text: each a key and a stake in the server's key grammar ("red 25",
 * "straight:17 5", "split:17,20 10"), separated by ", ", ";" or a new line. A bare number is a
 * straight on it ("17 5"). A ★ and a ":" or "=" between key and stake are ignored. Stakes of one
 * key are summed, as the server merges them. A part that is not exactly one key and one stake goes
 * to `unknown` rather than being guessed at, so a typo never becomes a bet that wasn't placed.
 */
export const parseRouletteBets = (text: string): { bets: RouletteBetInput[]; unknown: string[] } => {
  const merged = new Map<string, bigint>();
  const unknown: string[] = [];
  const token = /^([a-z]+(?::\d+(?:,\d+)*)?|\d+)\s*[:=×x]?\s*(\d+(?:[.,]\d+)?)$/i;
  for (const raw of text.split(/,\s+|;|\n/)) {
    const part = raw.replace(/★/g, "").trim();
    if (!part) continue;
    const match = token.exec(part);
    const key = !match ? null : /^\d+$/.test(match[1]) ? `straight:${Number(match[1])}` : match[1].toLowerCase();
    if (!match || !key || !ROULETTE_BETS.has(key)) {
      unknown.push(match ? match[1] : part);
      continue;
    }
    const nano = toNano(match[2].replace(",", "."));
    if (nano <= 0n) continue;
    merged.set(key, (merged.get(key) ?? 0n) + nano);
  }
  return { bets: [...merged].map(([key, nano]) => ({ key, stake: formatNano(nano) })), unknown };
};

/** stake × multiplier, exactly: a Ratio over 10^(stake decimals + 2). */
const times = (stake: string, multiplier: string): Ratio => {
  const s = ratio(stake);
  const m = ratio(multiplier);
  return { num: s.num * m.num, den: s.den * m.den };
};

const add = (a: Ratio, b: Ratio): Ratio =>
  a.den === b.den ? { num: a.num + b.num, den: a.den } : { num: a.num * b.den + b.num * a.den, den: a.den * b.den };

/** What each bet returns on a pocket, and the layout's exact total return. */
export const rouletteSettle = (bets: RouletteBetInput[], pocket: number) => {
  let exact: Ratio = { num: 0n, den: 1n };
  let total: Ratio = { num: 0n, den: 1n };
  const rows = bets.map(({ key, stake }) => {
    const covered = ROULETTE_BETS.get(key) ?? [];
    const multiplier = ROULETTE_PAY_TABLE[covered.length];
    const won = covered.includes(pocket);
    const back = won ? times(stake, multiplier) : { num: 0n, den: 1n };
    exact = add(exact, back);
    total = add(total, ratio(stake));
    return { key, stake, covers: covered.length, multiplier, won, back };
  });
  return { rows, exact, total };
};

/** RouletteMath.StarsPayout: the exact return rounded once on the rounding float, then the cap. */
export const rouletteStars = (exact: Ratio, roundingFloat: PfFloat) =>
  exact.num === 0n ? 0 : Math.min(toStars(1, exact, roundingFloat), ROULETTE_MAX_WIN_STARS);

/** RouletteMath.TonPayout: the exact return floored to the nanoton, then the cap. */
export const rouletteGram = (exact: Ratio) => {
  const nano = (exact.num * 1_000_000_000n) / exact.den;
  const cap = toNano(ROULETTE_MAX_WIN_GRAM);
  return formatNano(nano < cap ? nano : cap);
};
