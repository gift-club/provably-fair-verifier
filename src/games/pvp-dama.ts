/**
 * PvP Dama and Checkers, for the provably fair checker. Both tiles run on one backend and draw the
 * same way. Read 2026-10-26 from `PvpDamaService` (BaseFloatCount 2: FloatFirstMover 0,
 * FloatPayoutRounding 1; NewMatch sets `CreatorSide` from float 0) and `PvpDamaOptions`
 * (BetTiers 1, 5, 10, 20, 50, 100; HouseEdgePercent 0.05).
 *
 * The client seed of a match two players joined is the joiner's own, made on their device after the
 * server seed was committed (`JoinMatchCoreAsync`); the colours are drawn again at the join. A bot
 * match keeps the server-minted one (Spark rounds only, no pot).
 *
 * Float layout, all from the match's own seed at its base nonce:
 * - float 0: who plays white and so moves first (the creator when below 0.5);
 * - float 1: the payout rounding draw. At ★1 the pot is 1.9 and at ★5 it is 9.5, so only those
 *   two tiers depend on it.
 *
 * Play itself is deterministic, so the seed decides nothing else: every move is a player's own
 * choice, and the move played for a side whose clock ran out, like every bot move, comes from the
 * CSPRNG (`PvpDamaBot.ChooseMove` on `SecureRandom`), so neither is checkable here.
 */
import type { PfFloat } from "../provablyFair.js";

export const PVP_DAMA = {
  baseFloatCount: 2,
  firstMoverFloatIndex: 0,
  roundingFloatIndex: 1,
} as const;

/** `PvpDamaOptions.BetTiers`: ★1 opens the game below the other duels' ★5 floor. */
export const PVP_DAMA_STAR_STAKES = [1, 5, 10, 20, 50, 100] as const;

export interface PvpDamaBase {
  /** The creator plays white and moves first. */
  creatorPlaysWhite: boolean;
  firstMoverFloat: PfFloat;
  roundingFloat: PfFloat;
}

/** From the two floats at the base nonce. */
export const pvpDamaBase = (floats: PfFloat[]): PvpDamaBase => ({
  creatorPlaysWhite: floats[PVP_DAMA.firstMoverFloatIndex].value < 0.5,
  firstMoverFloat: floats[PVP_DAMA.firstMoverFloatIndex],
  roundingFloat: floats[PVP_DAMA.roundingFloatIndex],
});
