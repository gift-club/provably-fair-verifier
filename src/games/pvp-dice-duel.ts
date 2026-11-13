/**
 * PvP Dice Duel, for the provably fair checker. Read 2026-10-03 from
 * `PvpDiceDuelMath` (FloatsPerRound, NonceForRound, ToDie, DiceForRound, RoundWinnerRole),
 * `PvpDiceDuelService` (CreateMatchAsync / RematchAsync: server seed, a GUID client seed and base
 * nonce 0 per match; ApplyRollAsync: a tie replays under the next round number;
 * WinningsRoundingFloat) and `PvpDiceDuelOptions.RoundsToWin` (2, best of three).
 *
 * Float layout, all from the match's own seed:
 * - base nonce, float 0: the payout rounding draw. Nothing else reads the base nonce.
 * - nonce base + r (r = 1, 2, …): round r's four dice, creator's two first, then the opponent's.
 *
 * No player choice touches the dice, so the whole match replays from the seed alone: both
 * players' dice for every round are fixed before either rolls. A match that ended on a lapse
 * (a player let the roll clock run out) stops early; its played rounds still match the list.
 */
import { generateFloats, type PfFloat } from "../provablyFair.js";

export const PVP_DICE_DUEL = {
  dicePerPlayer: 2,
  sides: 6,
  /** Four floats per round: creator's pair, then opponent's. */
  floatsPerRound: 4,
  /** Floats read on the base nonce: the rounding draw only. */
  baseFloatCount: 1,
  roundingFloatIndex: 0,
  roundsToWin: 2,
  /** A guard for the replay: ties repeat, so a match has no fixed length. */
  maxReplayRounds: 200,
} as const;

export type PvpRole = "creator" | "opponent";

export interface PvpDiceRound {
  /** 1-based, as the app numbers rounds (ties included). */
  round: number;
  nonce: number;
  creator: [number, number];
  opponent: [number, number];
  /** Null on a tie, which scores for nobody and is replayed. */
  winner: PvpRole | null;
}

/** PvpDiceDuelMath.NonceForRound. */
export const pvpDiceDuelRoundNonce = (baseNonce: number, round: number) => baseNonce + round;

/** PvpDiceDuelMath.ToDie. */
const toDie = (f: PfFloat) => Math.min(Math.trunc(f.value * 6) + 1, 6);

/** One round from its four floats (drawn at `pvpDiceDuelRoundNonce`). */
export const pvpDiceDuelRoundFromFloats = (floats: PfFloat[], round: number, nonce: number): PvpDiceRound => {
  const d = floats.slice(0, PVP_DICE_DUEL.floatsPerRound).map(toDie);
  const creator: [number, number] = [d[0], d[1]];
  const opponent: [number, number] = [d[2], d[3]];
  const c = creator[0] + creator[1];
  const o = opponent[0] + opponent[1];
  return { round, nonce, creator, opponent, winner: c > o ? "creator" : o > c ? "opponent" : null };
};

/** Rounds 1..count. */
export const pvpDiceDuelRounds = async (
  serverSeed: Uint8Array,
  clientSeed: string,
  baseNonce: number,
  count: number,
): Promise<PvpDiceRound[]> =>
  Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const nonce = pvpDiceDuelRoundNonce(baseNonce, i + 1);
      return pvpDiceDuelRoundFromFloats(await generateFloats(serverSeed, clientSeed, nonce, PVP_DICE_DUEL.floatsPerRound), i + 1, nonce);
    }),
  );

/** The base nonce's rounding float (`WinningsRoundingFloat`). */
export const pvpDiceDuelRoundingFloat = async (serverSeed: Uint8Array, clientSeed: string, baseNonce: number) =>
  (await generateFloats(serverSeed, clientSeed, baseNonce, PVP_DICE_DUEL.baseFloatCount))[PVP_DICE_DUEL.roundingFloatIndex];

export interface PvpDiceDuelMatch {
  rounds: PvpDiceRound[];
  creatorWins: number;
  opponentWins: number;
  /** Who takes the pot if both players roll every round. */
  winner: PvpRole;
  roundingFloat: PfFloat;
}

/** The whole match played out: rounds until one side has `roundsToWin` (2). */
export const pvpDiceDuelMatch = async (
  serverSeed: Uint8Array,
  clientSeed: string,
  baseNonce: number,
  roundsToWin: number = PVP_DICE_DUEL.roundsToWin,
): Promise<PvpDiceDuelMatch> => {
  const rounds: PvpDiceRound[] = [];
  let creatorWins = 0;
  let opponentWins = 0;
  for (let r = 1; creatorWins < roundsToWin && opponentWins < roundsToWin; r++) {
    if (r > PVP_DICE_DUEL.maxReplayRounds) throw new Error("Dice Duel replay ran past its round guard.");
    const nonce = pvpDiceDuelRoundNonce(baseNonce, r);
    const round = pvpDiceDuelRoundFromFloats(await generateFloats(serverSeed, clientSeed, nonce, PVP_DICE_DUEL.floatsPerRound), r, nonce);
    if (round.winner === "creator") creatorWins++;
    else if (round.winner === "opponent") opponentWins++;
    rounds.push(round);
  }
  return {
    rounds,
    creatorWins,
    opponentWins,
    winner: creatorWins > opponentWins ? "creator" : "opponent",
    roundingFloat: await pvpDiceDuelRoundingFloat(serverSeed, clientSeed, baseNonce),
  };
};
