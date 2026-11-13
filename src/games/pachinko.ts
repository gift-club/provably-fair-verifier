/**
 * Pachinko for the provably fair checker. Read 2026-10-15 from:
 * - `PachinkoPaidService.PlayPaidAsync` / `PlayPaidTonAsync` / `GetVerificationAsync`
 *   (`PachinkoMath.FloatsPerRoundFor(table)` floats per round: 27 on v1–v3, 468 on v4; resolved
 *   with the bonus on, replayed under the round's `payTableVersion`);
 * - `PachinkoRoundResolver.Resolve` / `ResolveRush` (`PachinkoRound.cs`), `PachinkoRush` and
 *   `PachinkoMath` (float layout, gates, lanes, reels, lottery, `Classify`, `PayoutTon`);
 * - `PachinkoPayTable` V1, V2, V3, V4 (the RUSH table, current);
 * - the `Pachinko` block of appsettings.json (`MaxWinStars` 10000, `MaxWinTon` 1000).
 *
 * One ball per round, on two layouts.
 *
 * v1–v3 (fever): floats 0–6 are the ball: 0 entry lane (×16), 1–3 the three gates (< 0.25 drains
 * left, < 0.75 passes, else drains right), 4–6 the reels (×8). Through all three gates it reaches
 * the chucker and spins; through two and out at the third it lands in a side pocket (pays the
 * pocket multiplier on v2 and v3, nothing on v1). A base triple starts a fever of five balls on
 * floats 7–26, four each: lane, then three reels, at the fever table, never re-triggering.
 *
 * v4 (RUSH): floats 0–7 are the ball: lane, three gates, then the jackpot lottery (×64) and three
 * reels. The lottery decides: under 4 is a jackpot, shown as the left reel three times; otherwise
 * the reels show as drawn, except a drawn triple moves its right reel on one symbol. A jackpot on
 * an odd symbol (Bell, Clover, Crown, Seven) opens a RUSH of 7 bonus balls, an even one 4 fast
 * spins. Bonus ball b reads floats 8 + 5b: lane, lottery, three reels; it hits under 13 in a RUSH
 * and under 4 otherwise. A hit pays the bonus triple and resets the RUSH to 7; a miss pays the
 * bonus consolation or pair and takes one off. A RUSH that runs out gets 2 last-chance balls. The
 * chain stops at 100x: the ball that crosses it pays only what is left.
 *
 * Every float of the layout is drawn every round, Stars and Gram alike. The 468 are a prefix-safe
 * superset: v1–v3 read only the first 27 of them.
 *
 * Every multiplier is an integer, so a Stars payout is `bet × multiplier` exactly: no rounding
 * float. Stars are capped at 10,000 from v3 on (a v3 round tops out at 100x, so the cap never
 * binds); v1 and v2 rounds were paid uncapped. Gram is capped at 1,000 GRAM on every version (the cap the checker keeps for older rounds; today's tiers stay under 25 GRAM).
 *
 * Not covered: rounds played on 2026-08-13 between 13:58 and 20:21 UTC, when a round was ten
 * balls on 270 floats. The server's own verify endpoint replays them as one ball, too.
 */
import { type PfFloat, ratio, toGram } from "../provablyFair.js";

/**
 * Floats the checker draws, Stars and Gram alike: v4's 468. The engine's output is a prefix, so the
 * first 27 are exactly what a v1–v3 round drew. None of them rounds a payout.
 */
export const PACHINKO_FLOATS = { stars: 468, gram: 468 } as const;
/** Floats a round on each version drew (`PachinkoMath.FloatsPerRoundFor`). */
export const PACHINKO_FLOATS_BY_VERSION = { 1: 27, 2: 27, 3: 27, 4: 468 } as const;
export const PACHINKO_MAX_WIN_STARS = 10000;
export const PACHINKO_MAX_WIN_GRAM = "1000";

/** Reel symbols by id, as `PachinkoPayTable` indexes them. */
export const PACHINKO_SYMBOLS = ["Cherry", "Bell", "Plum", "Clover", "Gift", "Crown", "Diamond", "Seven"] as const;

export type PachinkoPayTableVersion = 1 | 2 | 3 | 4;
export const PACHINKO_CURRENT_PAY_TABLE: PachinkoPayTableVersion = 4;
export const PACHINKO_PAY_TABLE_VERSIONS: PachinkoPayTableVersion[] = [1, 2, 3, 4];

/** `PachinkoRushRules` on V4: numbers out of the 64-number lottery, and the ball counts. */
export interface PachinkoRushRules {
  baseJackpot: number;
  rushJackpot: number;
  jitanJackpot: number;
  rushBalls: number;
  jitanBalls: number;
  lastChanceBalls: number;
  cap: number;
}

export interface PachinkoPayTable {
  pocket: number;
  baseConsolation: number;
  feverConsolation: number;
  basePairs: number[];
  baseTriples: number[];
  feverPairs: number[];
  feverTriples: number[];
  /** V4 on: the RUSH loop. The fever fields then price the bonus balls. */
  rush?: PachinkoRushRules;
}

/** `PachinkoPayTable.V1`–`V4`, frozen. Rounds stored before versioning are version 1. */
export const PACHINKO_PAY_TABLES: Record<PachinkoPayTableVersion, PachinkoPayTable> = {
  1: {
    pocket: 0,
    baseConsolation: 2,
    feverConsolation: 6,
    basePairs: [6, 6, 8, 10, 10, 12, 14, 16],
    baseTriples: [50, 50, 60, 80, 100, 120, 160, 220],
    feverPairs: [16, 16, 20, 26, 26, 32, 36, 44],
    feverTriples: [110, 110, 130, 180, 220, 270, 350, 490],
  },
  2: {
    pocket: 1,
    baseConsolation: 3,
    feverConsolation: 4,
    basePairs: [4, 4, 6, 8, 8, 10, 10, 14],
    baseTriples: [40, 40, 50, 60, 72, 90, 110, 150],
    feverPairs: [10, 10, 12, 16, 16, 20, 24, 30],
    feverTriples: [60, 60, 80, 100, 120, 150, 200, 300],
  },
  3: {
    pocket: 1,
    baseConsolation: 3,
    feverConsolation: 6,
    basePairs: [6, 6, 8, 9, 11, 13, 16, 20],
    baseTriples: [20, 20, 24, 26, 28, 32, 35, 40],
    feverPairs: [7, 7, 8, 8, 9, 9, 10, 11],
    feverTriples: [9, 9, 10, 10, 11, 11, 11, 12],
  },
  4: {
    pocket: 1,
    baseConsolation: 3,
    feverConsolation: 1,
    basePairs: [4, 4, 5, 5, 6, 7, 8, 12],
    baseTriples: [8, 8, 10, 10, 12, 12, 15, 16],
    feverPairs: [2, 2, 2, 2, 2, 3, 3, 4],
    feverTriples: [4, 4, 5, 5, 6, 6, 7, 8],
    rush: { baseJackpot: 4, rushJackpot: 13, jitanJackpot: 4, rushBalls: 7, jitanBalls: 4, lastChanceBalls: 2, cap: 100 },
  },
};

/** The state a v4 bonus ball was shot in. */
export type PachinkoRushMode = "rush" | "jitan" | "last";

export type PachinkoGate = "left" | "pass" | "right";
export type PachinkoSpinKind = "none" | "pair" | "triple";
/** A base ball's `kind` in the verify response: a spin's class, or "pocket" / "drain". */
export type PachinkoBallKind = PachinkoSpinKind | "pocket" | "drain";
export type PachinkoRoundOutcome = "Dead" | "Consolation" | "Win" | "Fever";

export interface PachinkoBall {
  lane: number;
  gates: PachinkoGate[];
  reels: [number, number, number];
  /** `p` in the verify response's balls: gates in bits 0–5 (0 left, 1 pass, 2 right), lane in 6–9. */
  packedPath: number;
  /** `r`: reel 0 + 8 · reel 1 + 64 · reel 2. Reels are drawn even when the ball never spins. */
  packedReels: number;
  kind: PachinkoBallKind;
  multiplier: number;
}

export interface PachinkoFeverBall {
  lane: number;
  reels: [number, number, number];
  packedReels: number;
  kind: PachinkoSpinKind;
  multiplier: number;
  /** v4: the mode it was shot in, and the balls the mode had left, this one included. */
  mode?: PachinkoRushMode;
  ballsLeft?: number;
}

export interface PachinkoOutcome {
  ball: PachinkoBall;
  /** The five fever balls a base triple starts (v1–v3), the RUSH chain a jackpot starts (v4), or null. */
  fever: PachinkoFeverBall[] | null;
  /** v4: how the chain opened, and whether it stopped at the ceiling. */
  entry?: "rush" | "jitan";
  capped?: boolean;
  /** Round total as a multiple of the stake, always a whole number. */
  multiplier: number;
  outcome: PachinkoRoundOutcome;
}

const gate = (f: PfFloat): PachinkoGate => (f.value < 0.25 ? "left" : f.value < 0.75 ? "pass" : "right");
const GATE_BITS: Record<PachinkoGate, number> = { left: 0, pass: 1, right: 2 };
const lane = (f: PfFloat) => Math.min(Math.floor(f.value * 16), 15);
const symbol = (f: PfFloat) => Math.min(Math.floor(f.value * 8), 7);
const lottery = (f: PfFloat) => Math.min(Math.floor(f.value * 64), 63);

/** `PachinkoRush.Roll`: the lottery decides and the reels show it. */
const rushRoll = (l: PfFloat, r0: PfFloat, r1: PfFloat, r2: PfFloat, jackpotNumbers: number) => {
  const a = symbol(r0);
  if (lottery(l) < jackpotNumbers) return { reels: [a, a, a] as [number, number, number], jackpot: true };
  const b = symbol(r1);
  const c = symbol(r2);
  // `ShowAsLoss`: a drawn triple that lost moves its right reel on one symbol.
  return { reels: [a, b, a === b && b === c ? (c + 1) % 8 : c] as [number, number, number], jackpot: false };
};

/** `PachinkoMath.Classify`: the matched symbol is -1 when nothing matches. */
export const pachinkoClassify = ([a, b, c]: [number, number, number]): { kind: PachinkoSpinKind; symbol: number } => {
  if (a === b && b === c) return { kind: "triple", symbol: a };
  if (a === b || a === c) return { kind: "pair", symbol: a };
  if (b === c) return { kind: "pair", symbol: b };
  return { kind: "none", symbol: -1 };
};

/** `PachinkoMath.SpinMultiplier` under one table. */
export const pachinkoSpinMultiplier = (reels: [number, number, number], fever: boolean, table: PachinkoPayTable) => {
  const { kind, symbol: s } = pachinkoClassify(reels);
  if (kind === "triple") return (fever ? table.feverTriples : table.baseTriples)[s];
  if (kind === "pair") return (fever ? table.feverPairs : table.basePairs)[s];
  return fever ? table.feverConsolation : table.baseConsolation;
};

const packReels = ([a, b, c]: [number, number, number]) => a + 8 * b + 64 * c;

/** `PachinkoRoundResolver.ResolveRush`: one ball and its RUSH chain, on 468 floats. */
const rushOutcome = (floats: PfFloat[], table: PachinkoPayTable, rules: PachinkoRushRules): PachinkoOutcome => {
  const gates = [gate(floats[1]), gate(floats[2]), gate(floats[3])];
  const spin = rushRoll(floats[4], floats[5], floats[6], floats[7], rules.baseJackpot);
  const ballLane = lane(floats[0]);
  const reached = gates.every((g) => g === "pass");
  const pocketed = gates[0] === "pass" && gates[1] === "pass" && gates[2] !== "pass";
  const shown = pachinkoClassify(spin.reels);

  const ball: PachinkoBall = {
    lane: ballLane,
    gates,
    reels: spin.reels,
    packedPath: GATE_BITS[gates[0]] | (GATE_BITS[gates[1]] << 2) | (GATE_BITS[gates[2]] << 4) | (ballLane << 6),
    packedReels: packReels(spin.reels),
    kind: reached ? shown.kind : pocketed ? "pocket" : "drain",
    multiplier: reached ? pachinkoSpinMultiplier(spin.reels, false, table) : pocketed ? table.pocket : 0,
  };

  let fever: PachinkoFeverBall[] | null = null;
  let entry: "rush" | "jitan" | undefined;
  let total = ball.multiplier;
  if (reached && spin.jackpot) {
    fever = [];
    entry = shown.symbol % 2 === 1 ? "rush" : "jitan";
    let mode: PachinkoRushMode = entry;
    let left = entry === "rush" ? rules.rushBalls : rules.jitanBalls;
    while (total < rules.cap) {
      if (left === 0) {
        if (mode !== "rush" || rules.lastChanceBalls === 0) break;
        mode = "last";
        left = rules.lastChanceBalls;
        continue;
      }
      const o = 8 + 5 * fever.length;
      const bonus = rushRoll(floats[o + 1], floats[o + 2], floats[o + 3], floats[o + 4], mode === "rush" ? rules.rushJackpot : rules.jitanJackpot);
      const paid = Math.min(pachinkoSpinMultiplier(bonus.reels, true, table), rules.cap - total);
      total += paid;
      fever.push({
        lane: lane(floats[o]),
        reels: bonus.reels,
        packedReels: packReels(bonus.reels),
        kind: pachinkoClassify(bonus.reels).kind,
        multiplier: paid,
        mode,
        ballsLeft: left,
      });
      if (bonus.jackpot) {
        mode = "rush";
        left = rules.rushBalls;
      } else {
        left--;
      }
    }
  }

  const outcome: PachinkoRoundOutcome = fever ? "Fever" : reached ? "Win" : total > 0 ? "Consolation" : "Dead";
  return { ball, fever, multiplier: total, outcome, entry, capped: fever ? total >= rules.cap : undefined };
};

/** Replays one paid round from its floats under the round's `payTableVersion`. */
export const pachinkoOutcome = (
  floats: PfFloat[],
  version: PachinkoPayTableVersion = PACHINKO_CURRENT_PAY_TABLE,
): PachinkoOutcome => {
  const table = PACHINKO_PAY_TABLES[version];
  if (table.rush) return rushOutcome(floats, table, table.rush);
  const gates = [gate(floats[1]), gate(floats[2]), gate(floats[3])];
  const reels: [number, number, number] = [symbol(floats[4]), symbol(floats[5]), symbol(floats[6])];
  const ballLane = lane(floats[0]);
  const reached = gates.every((g) => g === "pass");
  const pocketed = table.pocket > 0 && gates[0] === "pass" && gates[1] === "pass" && gates[2] !== "pass";
  const spin = pachinkoClassify(reels);

  const ball: PachinkoBall = {
    lane: ballLane,
    gates,
    reels,
    packedPath: GATE_BITS[gates[0]] | (GATE_BITS[gates[1]] << 2) | (GATE_BITS[gates[2]] << 4) | (ballLane << 6),
    packedReels: packReels(reels),
    kind: reached ? spin.kind : pocketed ? "pocket" : "drain",
    multiplier: reached ? pachinkoSpinMultiplier(reels, false, table) : pocketed ? table.pocket : 0,
  };

  let fever: PachinkoFeverBall[] | null = null;
  if (reached && spin.kind === "triple") {
    fever = Array.from({ length: 5 }, (_, f) => {
      const o = 7 + 4 * f;
      const r: [number, number, number] = [symbol(floats[o + 1]), symbol(floats[o + 2]), symbol(floats[o + 3])];
      return {
        lane: lane(floats[o]),
        reels: r,
        packedReels: packReels(r),
        kind: pachinkoClassify(r).kind,
        multiplier: pachinkoSpinMultiplier(r, true, table),
      };
    });
  }

  const multiplier = ball.multiplier + (fever ?? []).reduce((sum, b) => sum + b.multiplier, 0);
  const outcome: PachinkoRoundOutcome = fever ? "Fever" : reached ? "Win" : multiplier > 0 ? "Consolation" : "Dead";
  return { ball, fever, multiplier, outcome };
};

/** Stars won: `bet × multiplier`, capped at 10,000 from v3 on (v1 and v2 had no cap). */
export const pachinkoStars = (bet: number, multiplier: number, version: PachinkoPayTableVersion) =>
  version >= 3 ? Math.min(bet * multiplier, PACHINKO_MAX_WIN_STARS) : bet * multiplier;

/** `PachinkoMath.PayoutTon`: Gram won, capped at 1,000 GRAM. */
export const pachinkoGram = (bet: string, multiplier: number): string =>
  toGram(bet, ratio(String(multiplier)), PACHINKO_MAX_WIN_GRAM);
