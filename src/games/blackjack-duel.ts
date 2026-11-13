/**
 * Blackjack Duel for the provably fair checker, mirroring the backend byte for byte. Sources, read
 * 2026-10-12:
 * - `PvpBlackjackMath`: a match commits one server seed and one client seed (a GUID the server mints)
 *   with a base nonce (`RoundNonce`). Hand `h` (1-based) is a fresh six-deck shoe at nonce
 *   `RoundNonce + h`, in the solo float order (`pf/blackjack.ts`). A tied hand is dealt again under
 *   the next hand number, so numbers are contiguous and decided hands are not.
 * - Seats: the creator reads the shoe like solo play (`CreatorSeat`: player from the front); the
 *   opponent reads `BlackjackSecondSeat` (its own stream off the back, past the dealer's 18);
 *   the dealer reads from the back, one hand for both. Both seats are dealt with `dealerWaits`: a
 *   seat that finishes is not settled until `BlackjackDuel.Settle` plays the dealer once for both,
 *   drawing only if some hand in either seat still stands. A dealer blackjack settles both on the deal.
 * - Scoring (`BlackjackDuel.Compare`): net stakes won against the dealer decide the hand (a blackjack
 *   +1.5, a won double +2, a lost double -2, a split sums its hands); equal nets tie and the hand is
 *   dealt again. A duel double or split moves the score, not money. First to `HandsToWin` (2) decided
 *   hands takes the pot.
 * - The pot (`PvpStakeLedger.Pot`, `HouseEdgePercent` 0.05): Stars 2 x stake x 0.95 rounded on float
 *   311 of the hand in play when the match settles (`RoundingHand`: the deciding hand of a match played
 *   out), Gram floored to the nanoton with no float. The stake tiers are even, so a Stars pot is whole.
 * - A seat's action script is H, S, D, P per move (a seat stood by its clock has S appended for each
 *   unfinished hand), stored per hand per seat and shown to the player in the hand's reveal.
 *
 * Pinned by `blackjack.test.ts` against `scripts/pf-vectors/blackjack.cs`.
 */
import { type PfFloat } from "../provablyFair.js";
import {
  BLACKJACK,
  blackjackDuelSettle,
  blackjackFloats,
  blackjackNet,
  blackjackPlayerDone,
  blackjackReplay,
  blackjackResultOf,
  blackjackShoe,
  frontSeat,
  parseBlackjackScript,
  secondSeat,
  type BlackjackRefusal,
  type BlackjackRules,
  type BlackjackMove,
  type BlackjackState,
} from "./blackjack.js";

export const BLACKJACK_DUEL = {
  /** `PvpBlackjackOptions.HandsToWin`. */
  handsToWin: 2,
  /** A guard for the replay: ties repeat, so a match has no fixed length. */
  maxHands: 200,
} as const;

export type BlackjackSeat = "creator" | "opponent";

/** `PvpBlackjackMath.NonceForHand`. */
export const blackjackDuelNonce = (baseNonce: number, hand: number) => baseNonce + hand;

/** One hand's two scripts, as typed. */
export interface BlackjackDuelHandInput {
  creator: string;
  opponent: string;
}

/**
 * The hands of a match as one string: hands separated by ";" or a new line, each hand
 * "creator moves / opponent moves" (either side may be empty when its seat had nothing to play, for
 * instance a blackjack on the deal), e.g. `HS/D; S/HH; /`.
 */
export const parseDuelHands = (text: string): { hands: BlackjackDuelHandInput[]; badEntry?: number } => {
  const hands: BlackjackDuelHandInput[] = [];
  const entries = text.split(/[;\n]/).map((e) => e.trim()).filter((e) => e !== "");
  for (let i = 0; i < entries.length; i++) {
    const parts = entries[i].split("/");
    if (parts.length !== 2) return { hands, badEntry: i + 1 };
    hands.push({ creator: parts[0], opponent: parts[1] });
  }
  return { hands };
};

export type BlackjackDuelProblem =
  | { hand: number; seat: BlackjackSeat; kind: "badChar"; char: string }
  | { hand: number; seat: BlackjackSeat; kind: "refused"; index: number; move: BlackjackMove; refusal: BlackjackRefusal }
  | { hand: number; seat: BlackjackSeat; kind: "unfinished" };

export interface BlackjackDuelHand {
  hand: number;
  nonce: number;
  shoe: number[];
  creator: BlackjackState;
  opponent: BlackjackState;
  /** Net stakes won against the dealer, in base stakes, scaled by the rule set's pay denominator. */
  creatorNet: bigint;
  opponentNet: bigint;
  /** The scale `creatorNet` and `opponentNet` are in: the rule set's pay denominator (10 for 3:2). */
  netDen: bigint;
  /** Null on a tie, which scores for nobody and is dealt again. */
  winner: BlackjackSeat | null;
  /** The hand's float 311, the pot's rounding float if this hand decides the match. */
  rounding: PfFloat;
  floats: PfFloat[];
}

export interface BlackjackDuelMatch {
  hands: BlackjackDuelHand[];
  creatorWins: number;
  opponentWins: number;
  /** Who takes the pot once a side has `handsToWin`; null while the entered hands leave it open. */
  winner: BlackjackSeat | null;
  /** Hands typed after the match was already decided (the server never deals them). */
  unused: number;
  problem?: BlackjackDuelProblem;
}

const scriptProblem = (
  hand: number,
  seat: BlackjackSeat,
  badChar: string | undefined,
  refused: { index: number; move: BlackjackMove; refusal: BlackjackRefusal } | undefined,
): BlackjackDuelProblem | undefined => {
  if (badChar !== undefined) return { hand, seat, kind: "badChar", char: badChar };
  if (refused) return { hand, seat, kind: "refused", ...refused };
  return undefined;
};

/**
 * Replays the entered hands in order from `firstHand`, until a side reaches `handsToWin`. Stops at
 * the first script the rules refuse or that leaves a seat with a hand to play.
 */
export const blackjackDuelMatch = async (
  serverSeed: Uint8Array,
  clientSeed: string,
  baseNonce: number,
  inputs: readonly BlackjackDuelHandInput[],
  rules: BlackjackRules,
  firstHand = 1,
  handsToWin: number = BLACKJACK_DUEL.handsToWin,
): Promise<BlackjackDuelMatch> => {
  const played: BlackjackDuelHand[] = [];
  let creatorWins = 0;
  let opponentWins = 0;
  for (let i = 0; i < inputs.length; i++) {
    if (creatorWins >= handsToWin || opponentWins >= handsToWin) {
      return { hands: played, creatorWins, opponentWins, winner: creatorWins > opponentWins ? "creator" : "opponent", unused: inputs.length - i };
    }
    const hand = firstHand + i;
    if (hand > BLACKJACK_DUEL.maxHands) throw new Error("Blackjack Duel replay ran past its hand guard.");
    const nonce = blackjackDuelNonce(baseNonce, hand);
    const floats = await blackjackFloats(serverSeed, clientSeed, nonce);
    const shoe = blackjackShoe(floats);

    const a = parseBlackjackScript(inputs[i].creator);
    const b = parseBlackjackScript(inputs[i].opponent);
    const ra = blackjackReplay(frontSeat(shoe), rules, a.moves, true);
    const rb = blackjackReplay(secondSeat(shoe), rules, b.moves, true);
    const problem =
      scriptProblem(hand, "creator", a.badChar, ra.problem) ??
      scriptProblem(hand, "opponent", b.badChar, rb.problem) ??
      (!blackjackPlayerDone(ra.state) ? ({ hand, seat: "creator", kind: "unfinished" } as const) : undefined) ??
      (!blackjackPlayerDone(rb.state) ? ({ hand, seat: "opponent", kind: "unfinished" } as const) : undefined);
    if (problem) return { hands: played, creatorWins, opponentWins, winner: null, unused: 0, problem };

    blackjackDuelSettle(ra.state, rb.state);
    const netA = blackjackNet(ra.state);
    const netB = blackjackNet(rb.state);
    // Both seats are under the same rule set, so the nets share a scale.
    const winner: BlackjackSeat | null = netA.num > netB.num ? "creator" : netA.num < netB.num ? "opponent" : null;
    if (winner === "creator") creatorWins++;
    else if (winner === "opponent") opponentWins++;
    played.push({
      hand,
      nonce,
      shoe,
      creator: ra.state,
      opponent: rb.state,
      creatorNet: netA.num,
      opponentNet: netB.num,
      netDen: netA.den,
      winner,
      rounding: floats[BLACKJACK.roundingFloatIndex],
      floats,
    });
  }
  const decided = creatorWins >= handsToWin || opponentWins >= handsToWin;
  return {
    hands: played,
    creatorWins,
    opponentWins,
    winner: decided ? (creatorWins > opponentWins ? "creator" : "opponent") : null,
    unused: 0,
  };
};

/** The results of one seat's hands, in order. */
export const seatResults = (s: BlackjackState) => s.hands.map((h) => blackjackResultOf(s, h));
