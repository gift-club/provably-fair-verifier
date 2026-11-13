/**
 * PvP Minefield, for the provably fair checker. Read 2026-10-03 from `PvpMinefieldService`
 * (GridSize 25, MineCount 3; CreateMatchAsync places the mines with the private `PlaceMines`
 * partial Fisher–Yates, the same as solo Minefield; JoinMatchAsync reads float MineCount for the
 * first move; WinningsRoundingFloat reads float MineCount + 1).
 *
 * Five floats on the match's base nonce: 0–2 place the three mines, 3 decides who picks first
 * (the creator when below 0.5), 4 is the payout rounding draw. Tiles are 0–24, row by row on the
 * 5 × 5 board. Whoever turns a mine loses. Matches created before the server seed was stored
 * have none, and cannot be checked.
 */
import { type PfFloat, placeMines } from "../provablyFair.js";

export const PVP_MINEFIELD = {
  gridSize: 25,
  columns: 5,
  mineCount: 3,
  floatCount: 5,
  firstMoverFloatIndex: 3,
  roundingFloatIndex: 4,
} as const;

export interface PvpMinefieldOutcome {
  /** Mine tiles in draw order. */
  mines: number[];
  creatorPicksFirst: boolean;
  firstMoverFloat: PfFloat;
  roundingFloat: PfFloat;
}

export const pvpMinefieldOutcome = (floats: PfFloat[]): PvpMinefieldOutcome => ({
  mines: placeMines(floats, 0, PVP_MINEFIELD.gridSize, PVP_MINEFIELD.mineCount),
  creatorPicksFirst: floats[PVP_MINEFIELD.firstMoverFloatIndex].value < 0.5,
  firstMoverFloat: floats[PVP_MINEFIELD.firstMoverFloatIndex],
  roundingFloat: floats[PVP_MINEFIELD.roundingFloatIndex],
});
