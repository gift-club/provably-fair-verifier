/**
 * PvP Ludo, for the provably fair checker. Read 2026-10-03 from `PvpLudoMath` (NonceForRoll,
 * ToDie, DiceForRoll), `PvpLudoService` (BaseFloatCount 3: FloatFirstMover 0,
 * FloatPayoutRounding 1, FloatCapTiebreak 2; ApplyMoveAndAdvance spends one roll index per move,
 * per player; EndOnTurnCap) and `PvpLudoOptions` (16-cell ring, 3 tokens, 2 home to win,
 * up to 3 rolls a turn on sixes, 50-turn cap).
 *
 * Float layout, all from the match's own seed:
 * - base nonce: float 0 who moves first (the creator when below 0.5), float 1 the payout
 *   rounding draw, float 2 the turn-cap tiebreak (read only when a match hits the cap with home
 *   tokens and total progress level; the creator wins it when below 0.5).
 * - each player's k-th roll (k = 0, 1, …, counted per player, extra rolls on a six included):
 *   two dice at nonce base + 1 + 2k + (0 creator, 1 opponent).
 *
 * The player picks which die to use and which token to move, so the board is not replayed here;
 * the checker lists each side's offered pairs, which the app's move list shows roll by roll.
 * A lapsed move still spends its roll index (the server plays the larger die).
 */
import { generateFloats, type PfFloat } from "../provablyFair.js";
import type { PvpRole } from "./pvp-dice-duel.js";

export const PVP_LUDO = {
  baseFloatCount: 3,
  firstMoverFloatIndex: 0,
  roundingFloatIndex: 1,
  capTiebreakFloatIndex: 2,
  diceOfferedPerRoll: 2,
  ringSize: 16,
  homeColumnLength: 4,
  tokensPerPlayer: 3,
  tokensToWin: 2,
  maxRollsPerTurn: 3,
  maxTurns: 50,
} as const;

/** PvpLudoMath.NonceForRoll. */
export const pvpLudoRollNonce = (baseNonce: number, role: PvpRole, rollIndex: number) =>
  baseNonce + 1 + 2 * rollIndex + (role === "creator" ? 0 : 1);

/** PvpLudoMath.ToDie over the two floats of one roll. */
export const pvpLudoDiceFromFloats = (floats: PfFloat[]): [number, number] => {
  const die = (f: PfFloat) => Math.min(Math.trunc(f.value * 6) + 1, 6);
  return [die(floats[0]), die(floats[1])];
};

export interface PvpLudoRoll {
  rollIndex: number;
  nonce: number;
  dice: [number, number];
}

/** One player's offered pairs for roll indices 0..count-1. */
export const pvpLudoRolls = async (
  serverSeed: Uint8Array,
  clientSeed: string,
  baseNonce: number,
  role: PvpRole,
  count: number,
): Promise<PvpLudoRoll[]> =>
  Promise.all(
    Array.from({ length: count }, async (_, rollIndex) => {
      const nonce = pvpLudoRollNonce(baseNonce, role, rollIndex);
      return { rollIndex, nonce, dice: pvpLudoDiceFromFloats(await generateFloats(serverSeed, clientSeed, nonce, PVP_LUDO.diceOfferedPerRoll)) };
    }),
  );

export interface PvpLudoBase {
  creatorMovesFirst: boolean;
  firstMoverFloat: PfFloat;
  roundingFloat: PfFloat;
  /** Decides a turn-cap finish only when home tokens and total progress are both level. */
  capTiebreakCreatorWins: boolean;
  capTiebreakFloat: PfFloat;
}

/** From the three floats at the base nonce. */
export const pvpLudoBase = (floats: PfFloat[]): PvpLudoBase => ({
  creatorMovesFirst: floats[PVP_LUDO.firstMoverFloatIndex].value < 0.5,
  firstMoverFloat: floats[PVP_LUDO.firstMoverFloatIndex],
  roundingFloat: floats[PVP_LUDO.roundingFloatIndex],
  capTiebreakCreatorWins: floats[PVP_LUDO.capTiebreakFloatIndex].value < 0.5,
  capTiebreakFloat: floats[PVP_LUDO.capTiebreakFloatIndex],
});
