/**
 * PvP Balloon Pump, for the provably fair checker. Read 2026-10-03 from
 * `PvpBalloonPumpService` (BurstFloatIndex 0, FirstTurnFloatIndex 1, PayoutRoundingFloatIndex 2,
 * FloatsPerMatch 3; CreateMatchAsync derives the burst pump, JoinMatchAsync the first turn,
 * WinningsRoundingFloat the payout draw), `PvpBalloonPumpMath.TurnPopsBalloon`,
 * `BalloonPumpMath.DeriveBurstPump(roll, survivalRate, maxPumps)` (the flat formula) and
 * `PvpBalloonPumpOptions` (SurvivalRate 0.90, MaxPumps 50, MaxPumpsPerTurn 3).
 *
 * Three floats on the match's base nonce: burst pump, who pumps first, payout rounding. The
 * burst pump is fixed at creation; which player reaches it depends on how many pumps (1–3) each
 * took per turn, so the checker shows the burst pump and the player reads who pressed it from
 * the match. Whoever makes the pump that reaches it loses. A burst pump of 51 means the balloon
 * cannot burst: it deflates at 50 pumps and both stakes are returned.
 */
import { type BalloonCurve, balloonBurstPump, type PfFloat } from "../provablyFair.js";

export const PVP_BALLOON_PUMP = {
  floatsPerMatch: 3,
  burstFloatIndex: 0,
  firstTurnFloatIndex: 1,
  roundingFloatIndex: 2,
  survivalPct: 90,
  maxPumps: 50,
  maxPumpsPerTurn: 3,
} as const;

/** The duel's balloon as a flat curve, so the solo game's `balloonBurstPump` takes the same log path. */
export const PVP_BALLOON_CURVE: BalloonCurve = {
  targetRtp: 0.95,
  earlySurvivalPct: 0,
  survivalStepPct: 0,
  survivalPct: PVP_BALLOON_PUMP.survivalPct,
  maxPumps: PVP_BALLOON_PUMP.maxPumps,
};

/** BalloonPumpMath.DeriveBurstPump(roll, 0.90, 50). 51 = cannot burst (deflates at 50). */
export const pvpBalloonBurstPump = (roll: number) => balloonBurstPump(roll, PVP_BALLOON_CURVE);

export interface PvpBalloonPumpOutcome {
  /** The pump that pops the balloon, 1-based; maxPumps + 1 when it cannot pop. */
  burstPump: number;
  /** Whether the balloon reaches the ceiling unpopped: the match is a draw, stakes returned. */
  deflates: boolean;
  creatorPumpsFirst: boolean;
  firstTurnFloat: PfFloat;
  roundingFloat: PfFloat;
}

/** From the three floats at the base nonce. */
export const pvpBalloonPumpOutcome = (floats: PfFloat[]): PvpBalloonPumpOutcome => {
  const burstPump = pvpBalloonBurstPump(floats[PVP_BALLOON_PUMP.burstFloatIndex].value);
  return {
    burstPump,
    deflates: burstPump > PVP_BALLOON_PUMP.maxPumps,
    creatorPumpsFirst: floats[PVP_BALLOON_PUMP.firstTurnFloatIndex].value < 0.5,
    firstTurnFloat: floats[PVP_BALLOON_PUMP.firstTurnFloatIndex],
    roundingFloat: floats[PVP_BALLOON_PUMP.roundingFloatIndex],
  };
};
