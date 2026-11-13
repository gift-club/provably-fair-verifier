/**
 * Blackjack for the provably fair checker, mirroring the backend byte for byte. Sources, read
 * 2026-10-12:
 * - `BlackjackMath`: every hand is a fresh six-deck shoe (312 cards). A hand draws 312 floats from
 *   `HMAC_SHA256(serverSeed, clientSeed:nonce:round)` at its nonce. Floats 0 to 310 drive a full
 *   Fisher-Yates pass (swap k, for i = 311 down to 1, uses float k and swaps with
 *   `min(floor(f x (i + 1)), i)`); float 311 only rounds a Stars payout that isn't whole. Card id
 *   = suit x 13 + rank index (0 ace .. 12 king), the shoe holds each id six times before the shuffle.
 * - Two streams. The player's cards come off the front (position 0, 1, 2.., split hands included,
 *   in the order they are dealt); the dealer's come off the back (311 up-card, 310 hole card, then
 *   309, 308..). A duel's second seat reads its own player stream off the back past the dealer's:
 *   `BlackjackSecondSeat`, back position 18 + n.
 * - `BlackjackHand` is the state machine `Replay(shoe, rules, actions)` runs: the deal is player,
 *   dealer up, player, dealer hole; the dealer peeks under an ace or a ten-value card and a
 *   blackjack ends the hand at once (a player blackjack pushes, anything else loses its first
 *   stake). A hand finishes by itself at 21 or on a bust. Split once; split aces take one card
 *   each; 21 on a split hand is 21, not blackjack. The dealer plays only after every player hand is
 *   done, and draws only if one is still standing (not bust, not a blackjack), hitting below 17
 *   and, under H17, on a soft 17.
 * - Rule set 1 (`BlackjackMath.V1`, frozen): 3:2, dealer hits soft 17, double on a hard 9 to 11
 *   only, no double after a split. A hand stores the version it was dealt under.
 * - `BlackjackHand.ReturnMultiple`: a blackjack returns stakes x (1 + 1.5), a win stakes x 2, a push
 *   the stakes, a loss or bust 0, summed over the hands, in base stakes. `BlackjackService.SettleAsync`
 *   pays Stars `min(ToStars(bet x return, float 311), 10000)` and Gram
 *   `min(ToTon(bet x return), 1000)`.
 * - The action script is one character per move, H hit, S stand, D double, P split
 *   (`PvpBlackjackMath.MoveChar`), exactly what `GET /api/blackjack/verify/{gameId}` returns as
 *   `actions` next to the seed, client seed, nonce and `ruleSetVersion`.
 *
 * Pinned by `blackjack.test.ts` against `scripts/pf-vectors/blackjack.cs`.
 */
import { GRAM_MAX_WIN, generateFloats, ratio, toGram, toStars, type PfFloat, type Ratio } from "../provablyFair.js";

export const BLACKJACK = {
  decks: 6,
  shoeSize: 312,
  /** Floats the shuffle consumes: one per swap, i = 311 down to 1. */
  shuffleFloats: 311,
  /** Floats a hand draws: the shuffle and then the rounding float. */
  floatsPerHand: 312,
  roundingFloatIndex: 311,
  maxPlayerCards: 44,
  maxDealerCards: 18,
  maxHands: 2,
  /** `BlackjackOptions.MaxWinStars`. */
  maxWinStars: 10000,
  /** `BlackjackOptions.MaxWinTon`, the same 1000 GRAM every game caps at. */
  maxWinGram: GRAM_MAX_WIN,
} as const;

// ── Rules ────────────────────────────────────────────────────────────────────

export type BlackjackDoubleRule = "NineToEleven" | "AnyTwo";

export interface BlackjackRules {
  version: number;
  name: string;
  /** What a natural pays on top of the stake: "1.5" for 3:2. */
  blackjackPays: string;
  dealerHitsSoft17: boolean;
  double: BlackjackDoubleRule;
  doubleAfterSplit: boolean;
}

/** `BlackjackMath.V1`, the only rule set that has taken bets. */
export const BLACKJACK_V1: BlackjackRules = {
  version: 1,
  name: "3:2 H17 D9-11 noDAS",
  blackjackPays: "1.5",
  dealerHitsSoft17: true,
  double: "NineToEleven",
  doubleAfterSplit: false,
};

/** Every published rule set, by version (`BlackjackMath.Published`). */
export const BLACKJACK_RULE_SETS: readonly BlackjackRules[] = [BLACKJACK_V1];

export const blackjackRulesFor = (version: number) => BLACKJACK_RULE_SETS.find((r) => r.version === version);

// ── Cards ────────────────────────────────────────────────────────────────────

/** 0 hearts, 1 diamonds, 2 clubs, 3 spades (the app's `BlackjackCardView.Suit`). */
export const BLACKJACK_SUITS = ["♥", "♦", "♣", "♠"] as const;
export const BLACKJACK_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

/** `BlackjackMath.RankIndex`: 0 ace .. 12 king. */
export const cardRank = (id: number) => id % 13;
/** `BlackjackMath.Suit`. */
export const cardSuit = (id: number) => Math.floor(id / 13);
/** `BlackjackMath.Value`: an ace is 1 here, counted 11 by `blackjackTotal` when it fits. */
export const cardValue = (id: number) => Math.min(cardRank(id) + 1, 10);
export const blackjackCardLabel = (id: number) => `${BLACKJACK_RANKS[cardRank(id)]}${BLACKJACK_SUITS[cardSuit(id)]}`;
export const isRedSuit = (id: number) => cardSuit(id) < 2;

/** `BlackjackMath.Total`: the best total and whether an ace counts 11 in it. */
export const blackjackTotal = (cards: readonly number[]): { total: number; soft: boolean } => {
  let sum = 0;
  let aces = false;
  for (const c of cards) {
    const v = cardValue(c);
    sum += v;
    if (v === 1) aces = true;
  }
  return aces && sum + 10 <= 21 ? { total: sum + 10, soft: true } : { total: sum, soft: false };
};

const isNatural = (cards: readonly number[]) => cards.length === 2 && blackjackTotal(cards).total === 21;

// ── The shoe ─────────────────────────────────────────────────────────────────

/** All 312 floats of a hand at its nonce. */
export const blackjackFloats = (serverSeed: Uint8Array, clientSeed: string, nonce: number) =>
  generateFloats(serverSeed, clientSeed, nonce, BLACKJACK.floatsPerHand);

/** `BlackjackMath.ShuffleShoe`: 312 card ids, Fisher-Yates over floats 0 to 310. */
export const blackjackShoe = (floats: readonly PfFloat[]): number[] => {
  if (floats.length < BLACKJACK.shuffleFloats) throw new Error("Not enough floats to shuffle the shoe.");
  const shoe = Array.from({ length: BLACKJACK.shoeSize }, (_, i) => i % 52);
  for (let i = BLACKJACK.shoeSize - 1, f = 0; i > 0; i--, f++) {
    const j = Math.min(Math.trunc(floats[f].value * (i + 1)), i);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
};

/** Where a seat reads its cards: its own player stream and the shared dealer stream. */
export interface BlackjackSeatReader {
  player: (position: number) => number;
  dealer: (position: number) => number;
}

/** Solo play, and a duel's creator: the player from the front, the dealer from the back. */
export const frontSeat = (shoe: readonly number[]): BlackjackSeatReader => ({
  player: (p) => shoe[p],
  dealer: (p) => shoe[BLACKJACK.shoeSize - 1 - p],
});

/** A duel's opponent: its own stream off the back, past the dealer's 18 positions. */
export const secondSeat = (shoe: readonly number[]): BlackjackSeatReader => ({
  player: (p) => shoe[BLACKJACK.shoeSize - 1 - (BLACKJACK.maxDealerCards + p)],
  dealer: (p) => shoe[BLACKJACK.shoeSize - 1 - p],
});

// ── The hand ─────────────────────────────────────────────────────────────────

export type BlackjackMove = "H" | "S" | "D" | "P";

/** `BlackjackMath.Refusal`, minus None. */
export type BlackjackRefusal =
  | "HandOver"
  | "NotFirstTwoCards"
  | "DoubleTotalNotAllowed"
  | "NoDoubleAfterSplit"
  | "SplitAcesTakeOneCard"
  | "NotAPair"
  | "AlreadySplit";

export type BlackjackResult = "Blackjack" | "Win" | "Push" | "Loss" | "Bust";

export interface BlackjackPlayerHand {
  cards: number[];
  /** Base stakes on this hand: 1, or 2 once doubled. */
  stakes: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  finished: boolean;
}

export interface BlackjackState {
  rules: BlackjackRules;
  reader: BlackjackSeatReader;
  dealerWaits: boolean;
  hands: BlackjackPlayerHand[];
  /** Every dealer card drawn so far, the up-card first and the hole card second. */
  dealer: number[];
  active: number;
  playerPosition: number;
  dealerNatural: boolean;
  settled: boolean;
}

const handTotalOf = (h: BlackjackPlayerHand) => blackjackTotal(h.cards);
const isBusted = (h: BlackjackPlayerHand) => handTotalOf(h).total > 21;
/** A natural counts only on an unsplit hand's first two cards. */
const isHandNatural = (h: BlackjackPlayerHand) => !h.fromSplit && isNatural(h.cards);

const nextPlayerCard = (s: BlackjackState) => s.reader.player(s.playerPosition++);

/** `BlackjackHand.Deal`: player, dealer up, player, dealer hole, then the peek. */
export const blackjackDeal = (reader: BlackjackSeatReader, rules: BlackjackRules, dealerWaits = false): BlackjackState => {
  const s: BlackjackState = {
    rules,
    reader,
    dealerWaits,
    hands: [{ cards: [], stakes: 1, doubled: false, fromSplit: false, splitAces: false, finished: false }],
    dealer: [],
    active: 0,
    playerPosition: 0,
    dealerNatural: false,
    settled: false,
  };
  const first = s.hands[0];
  first.cards.push(nextPlayerCard(s));
  s.dealer.push(reader.dealer(0));
  first.cards.push(nextPlayerCard(s));
  s.dealer.push(reader.dealer(1));

  if (isNatural(s.dealer)) {
    s.dealerNatural = true;
    first.finished = true;
    s.settled = true;
    return s;
  }
  if (isHandNatural(first)) {
    first.finished = true;
    s.settled = !dealerWaits;
  }
  return s;
};

/** Every player hand has finished (solo: the hand is settled too; a duel seat waits for the dealer). */
export const blackjackPlayerDone = (s: BlackjackState) => s.settled || s.hands.every((h) => h.finished);

/** A hand is still standing against the dealer: not bust, and not a natural. */
const needsDealer = (s: BlackjackState) => s.hands.some((h) => !isBusted(h) && !isHandNatural(h));

/** `BlackjackHand.Check`: why `move` is illegal now, or null. */
export const blackjackCheck = (s: BlackjackState, move: BlackjackMove): BlackjackRefusal | null => {
  const h = s.hands[s.active];
  if (s.settled || h.finished) return "HandOver";
  switch (move) {
    case "H":
      return h.splitAces ? "SplitAcesTakeOneCard" : null;
    case "S":
      return null;
    case "D": {
      if (h.splitAces) return "SplitAcesTakeOneCard";
      if (h.cards.length !== 2) return "NotFirstTwoCards";
      if (h.fromSplit && !s.rules.doubleAfterSplit) return "NoDoubleAfterSplit";
      if (s.rules.double === "NineToEleven") {
        const { total, soft } = blackjackTotal(h.cards);
        if (soft || total < 9 || total > 11) return "DoubleTotalNotAllowed";
      }
      return null;
    }
    case "P":
      if (s.hands.length >= BLACKJACK.maxHands) return "AlreadySplit";
      if (h.cards.length !== 2 || cardValue(h.cards[0]) !== cardValue(h.cards[1])) return "NotAPair";
      return null;
  }
};

/** `BlackjackHand.PlayDealer`. */
const playDealer = (s: BlackjackState, dealerDraws: boolean) => {
  if (dealerDraws) {
    let position = s.dealer.length;
    for (;;) {
      const { total, soft } = blackjackTotal(s.dealer);
      const hits = total < 17 || (total === 17 && soft && s.rules.dealerHitsSoft17);
      if (!hits) break;
      s.dealer.push(s.reader.dealer(position++));
    }
  }
  s.settled = true;
};

/** `BlackjackHand.AdvanceFinishedHands`. */
const advanceFinishedHands = (s: BlackjackState) => {
  while (s.hands[s.active].finished) {
    if (s.active === s.hands.length - 1) {
      if (!s.dealerWaits) playDealer(s, needsDealer(s));
      return;
    }
    s.active++;
    const next = s.hands[s.active];
    if (next.cards.length === 1) {
      next.cards.push(nextPlayerCard(s));
      if (next.splitAces || handTotalOf(next).total === 21) next.finished = true;
    }
  }
};

/** `BlackjackHand.Apply`: the refusal (state untouched) or null after playing the move. */
export const blackjackApply = (s: BlackjackState, move: BlackjackMove): BlackjackRefusal | null => {
  const refusal = blackjackCheck(s, move);
  if (refusal) return refusal;
  const h = s.hands[s.active];
  switch (move) {
    case "H":
      h.cards.push(nextPlayerCard(s));
      if (handTotalOf(h).total >= 21) h.finished = true;
      break;
    case "S":
      h.finished = true;
      break;
    case "D":
      h.stakes = 2;
      h.doubled = true;
      h.cards.push(nextPlayerCard(s));
      h.finished = true;
      break;
    case "P": {
      const aces = cardValue(h.cards[0]) === 1;
      const left: BlackjackPlayerHand = { cards: [h.cards[0]], stakes: 1, doubled: false, fromSplit: true, splitAces: aces, finished: false };
      const right: BlackjackPlayerHand = { cards: [h.cards[1]], stakes: 1, doubled: false, fromSplit: true, splitAces: aces, finished: false };
      s.hands[s.active] = left;
      s.hands.splice(s.active + 1, 0, right);
      // The left hand gets its second card now; the right one when play reaches it.
      left.cards.push(nextPlayerCard(s));
      if (aces || handTotalOf(left).total === 21) left.finished = true;
      break;
    }
  }
  advanceFinishedHands(s);
  return null;
};

/** The duel's settle: plays the one dealer hand for both seats, drawing only if some hand still stands. */
export const blackjackDuelSettle = (a: BlackjackState, b: BlackjackState) => {
  if (!blackjackPlayerDone(a) || !blackjackPlayerDone(b)) throw new Error("Both seats must finish before the dealer plays.");
  const draws = needsDealer(a) || needsDealer(b);
  for (const s of [a, b]) if (!s.settled) playDealer(s, draws);
};

/** `BlackjackHand.ResultOf`; only for a settled hand. */
export const blackjackResultOf = (s: BlackjackState, h: BlackjackPlayerHand): BlackjackResult => {
  if (s.dealerNatural) return isHandNatural(h) ? "Push" : "Loss";
  if (isHandNatural(h)) return "Blackjack";
  if (isBusted(h)) return "Bust";
  const dealer = blackjackTotal(s.dealer).total;
  const total = handTotalOf(h).total;
  if (dealer > 21 || total > dealer) return "Win";
  return total === dealer ? "Push" : "Loss";
};

/** Base stakes committed: 1, plus one per double and per split. */
export const blackjackStakes = (s: BlackjackState) => s.hands.reduce((n, h) => n + h.stakes, 0);

/**
 * `BlackjackHand.ReturnMultiple`, exact, in base stakes with the stakes included: the sum over the
 * hands of stakes x (1 + pays) for a blackjack, x 2 for a win, x 1 for a push, 0 otherwise.
 */
export const blackjackReturn = (s: BlackjackState): Ratio => {
  const pays = ratio(s.rules.blackjackPays);
  let num = 0n;
  for (const h of s.hands) {
    const stakes = BigInt(h.stakes);
    switch (blackjackResultOf(s, h)) {
      case "Blackjack":
        num += stakes * (pays.den + pays.num);
        break;
      case "Win":
        num += stakes * 2n * pays.den;
        break;
      case "Push":
        num += stakes * pays.den;
        break;
    }
  }
  return { num, den: pays.den };
};

/** `BlackjackHand.Net`: what the hand returned less what it staked, in base stakes (same denominator as the return). */
export const blackjackNet = (s: BlackjackState): Ratio => {
  const r = blackjackReturn(s);
  return { num: r.num - BigInt(blackjackStakes(s)) * r.den, den: r.den };
};

// ── Scripts and replay ───────────────────────────────────────────────────────

export type BlackjackScriptProblem =
  | { kind: "badChar"; char: string }
  | { kind: "refused"; index: number; move: BlackjackMove; refusal: BlackjackRefusal };

/**
 * A pasted action script: H hit, S stand, D double, P split, any case, with spaces, commas and
 * dashes ignored. Returns the first character that is not a move.
 */
export const parseBlackjackScript = (text: string): { moves: BlackjackMove[]; badChar?: string } => {
  const moves: BlackjackMove[] = [];
  for (const ch of text) {
    if (/[\s,.\-·]/.test(ch)) continue;
    const up = ch.toUpperCase();
    if (up === "H" || up === "S" || up === "D" || up === "P") moves.push(up);
    else return { moves, badChar: ch };
  }
  return { moves };
};

/**
 * `BlackjackHand.Replay`: deals, then plays each move in order. Stops at the first move the rules
 * refuse (the server throws there) and says which.
 */
export const blackjackReplay = (
  reader: BlackjackSeatReader,
  rules: BlackjackRules,
  moves: readonly BlackjackMove[],
  dealerWaits = false,
): { state: BlackjackState; problem?: Extract<BlackjackScriptProblem, { kind: "refused" }> } => {
  const state = blackjackDeal(reader, rules, dealerWaits);
  for (let i = 0; i < moves.length; i++) {
    const refusal = blackjackApply(state, moves[i]);
    if (refusal) return { state, problem: { kind: "refused", index: i + 1, move: moves[i], refusal } };
  }
  return { state };
};

export interface BlackjackRound {
  state: BlackjackState;
  /** The script as played, one letter per move. */
  script: string;
  problem?: BlackjackScriptProblem;
  /** The script ran out with a hand still to play (so nothing is settled). */
  unfinished: boolean;
  results: BlackjackResult[];
  returned: Ratio;
  stakes: number;
}

/** One solo hand from its shoe and script. */
export const blackjackRound = (shoe: readonly number[], rules: BlackjackRules, script: string): BlackjackRound => {
  const { moves, badChar } = parseBlackjackScript(script);
  const { state, problem } = blackjackReplay(frontSeat(shoe), rules, moves);
  const unfinished = !state.settled;
  return {
    state,
    script: moves.join(""),
    problem: badChar !== undefined ? { kind: "badChar", char: badChar } : problem,
    unfinished,
    results: state.settled ? state.hands.map((h) => blackjackResultOf(state, h)) : [],
    returned: state.settled ? blackjackReturn(state) : { num: 0n, den: 1n },
    stakes: blackjackStakes(state),
  };
};

// ── Payouts ──────────────────────────────────────────────────────────────────

/** `BlackjackService.SettleAsync` on Stars: `ToStars(bet x return, float 311)`, capped at `MaxWinStars`. */
export const blackjackStarsPayout = (bet: number, returned: Ratio, rounding: PfFloat) =>
  Math.min(toStars(bet, returned, rounding), BLACKJACK.maxWinStars);

/** `BlackjackService.SettleAsync` on Gram: `ToTon(bet x return)`, capped at `MaxWinTon`. */
export const blackjackGramPayout = (bet: string, returned: Ratio) => toGram(bet, returned, BLACKJACK.maxWinGram);

/** An exact ratio whose denominator is a power of ten, as a plain decimal ("2.5", "0"). */
export const ratioDecimal = (r: Ratio): string => {
  const negative = r.num < 0n;
  const abs = negative ? -r.num : r.num;
  const whole = abs / r.den;
  let rest = abs % r.den;
  let digits = "";
  while (rest !== 0n && digits.length < 12) {
    rest *= 10n;
    digits += String(rest / r.den);
    rest %= r.den;
  }
  return `${negative ? "-" : ""}${whole}${digits ? `.${digits}` : ""}`;
};
