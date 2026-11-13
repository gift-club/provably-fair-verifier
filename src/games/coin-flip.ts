/**
 * Coin Flip with Let it ride for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-08:
 * - `CoinFlipMath`: a round reads one HMAC stream at its nonce. Float 0 is the first flip (0.5 and
 *   above is Heads), float 1 rounds a Stars pot (a Gram round leaves it unused), and float `2 + i`
 *   is ride `i`. The stream is prefix-consistent (32-byte HMAC blocks), so a round that never rode
 *   shows exactly the two floats (Stars) or one float (Gram) it always drew, and a round that rode
 *   adds one float per ride played. The verify endpoint returns `2 + rides` floats for it.
 * - The ladder is `WinMultiplier × 2^(step − 1)`: 1.90, 3.80, 7.60, 15.20, 30.40 (`CoinFlipMath.Ladder`,
 *   `MaxRides` 4 in appsettings.json). Step is the number of correct calls so far. Every ride is an
 *   even bet on the whole pot.
 * - `CoinFlipPaidService.RideAsync`: ride `i` reads float `2 + i`. A right call is one more step, a
 *   wrong one ends the round with nothing won, and the top rung (step 5) is taken on its own. Taking
 *   at any other step pays that step's pot.
 * - Pots are whole. A Stars first pot is `bet × 1.90` rounded by float 1 (`CoinFlipMath.FirstPotStars`,
 *   `PayoutCalculator.ToStars`), and each won ride doubles that integer exactly, so the payout is NOT
 *   `ToStars(bet × 3.80)`. A Gram first pot is `bet × 1.90` floored to the nanoton
 *   (`CoinFlipMath.FirstPotTon`), doubled exactly, and paid at most `MaxWinTon`, 1000 GRAM
 *   (`CoinFlipMath.PaidTon`).
 *
 * Pinned by `coin-flip.test.ts` against `scripts/pf-vectors/coin-flip.cs`.
 */
import {
  GRAM_MAX_WIN,
  formatNano,
  ratio,
  toGramNano,
  toNano,
  toStars,
  type GramBet,
  type PfFloat,
} from "../provablyFair.js";

export type CoinSide = "heads" | "tails";

/** CoinFlipOptions.WinMultiplier, appsettings.json. */
export const COIN_FLIP_WIN_MULTIPLIER = "1.90";

/** Rides after the first win (`CoinFlipOptions.MaxRides`), so the ladder has this many rungs plus one. */
export const COIN_FLIP_MAX_RIDES = 4;

/** CoinFlipMath.Ladder: the nominal multiplier of step 1 to 5. */
export const COIN_FLIP_LADDER = ["1.90", "3.80", "7.60", "15.20", "30.40"];

/** CoinFlipMath.FlipFloat, RoundingFloat and FirstRideFloat. */
export const COIN_FLIP_FLIP_FLOAT = 0;
export const COIN_FLIP_ROUNDING_FLOAT = 1;
export const COIN_FLIP_FIRST_RIDE_FLOAT = 2;

/**
 * How many floats a round drew, as the verify endpoint returns them: two on Stars and one on Gram when
 * it never rode, `2 + rides` when it did (a Gram round leaves float 1 unused).
 */
export const coinFlipFloatCount = (rides: number, currency: "stars" | "gram") =>
  rides > 0 ? COIN_FLIP_FIRST_RIDE_FLOAT + Math.min(rides, COIN_FLIP_MAX_RIDES) : currency === "gram" ? 1 : 2;

/** CoinFlipMath.SideOf: 0.5 and above is Heads. */
export const coinFlipSide = (f: PfFloat): CoinSide => (f.value >= 0.5 ? "heads" : "tails");

/**
 * The calls typed as letters ("HTH", "h t t") in the order the rides were played, the way the verify
 * endpoint's `rideCalls` writes them: H heads, T tails. The ru and uk initials work too
 * (О for орёл / орел, Р for решка). Anything else is skipped.
 */
export const parseRideCalls = (text: string): CoinSide[] =>
  Array.from(text.toUpperCase())
    .filter((ch) => ch === "H" || ch === "T" || ch === "О" || ch === "Р")
    .map((ch) => (ch === "H" || ch === "О" ? "heads" : "tails"))
    .slice(0, COIN_FLIP_MAX_RIDES);

export interface CoinFlipRide {
  call: CoinSide;
  landed: CoinSide;
  won: boolean;
}

export interface CoinFlipRound {
  /** The side the first flip landed on (float 0). */
  first: CoinSide;
  rides: CoinFlipRide[];
  /** Correct calls so far, the first flip included. After a lost ride it is the step the pot had reached. */
  step: number;
  /** The first flip, or a ride, was called wrong. */
  lost: boolean;
  /** Step 5: the server takes the pot on its own. */
  atTop: boolean;
  /** Rides won: the pot has doubled this many times. */
  ridesWon: number;
  /** What taking the pot pays, as a ladder multiplier ("0" once lost). */
  multiplier: string;
}

/**
 * A round replayed from its floats and the player's calls, the way `RideAsync` plays it: the first
 * flip meets float 0, ride `i` meets float `2 + i`, a wrong call ends the round, and step 5 ends it on
 * its own. Calls past the end of the round are ignored. `multiplier` is what the pot pays after the last
 * call that counted, whether the player took it or the top rung did.
 */
export const coinFlipRound = (floats: PfFloat[], call: CoinSide, rideCalls: CoinSide[]): CoinFlipRound => {
  const first = coinFlipSide(floats[COIN_FLIP_FLIP_FLOAT]);
  let step = first === call ? 1 : 0;
  let lost = step === 0;
  const rides: CoinFlipRide[] = [];
  for (let i = 0; i < rideCalls.length && !lost && step <= COIN_FLIP_MAX_RIDES; i++) {
    const f = floats[COIN_FLIP_FIRST_RIDE_FLOAT + i];
    if (!f) break;
    const landed = coinFlipSide(f);
    const won = landed === rideCalls[i];
    if (won) step++;
    else lost = true;
    rides.push({ call: rideCalls[i], landed, won });
  }
  return {
    first,
    rides,
    step,
    lost,
    atTop: !lost && step === COIN_FLIP_MAX_RIDES + 1,
    ridesWon: Math.max(0, step - 1),
    multiplier: lost ? "0" : COIN_FLIP_LADDER[step - 1],
  };
};

/**
 * What a Stars round pays after `ridesWon` won rides: the first pot (`bet × 1.90`, rounded by float 1)
 * doubled exactly per ride (`CoinFlipMath.PotStars`).
 */
export const coinFlipPotStars = (bet: number, rounding: PfFloat, ridesWon: number) =>
  toStars(bet, ratio(COIN_FLIP_WIN_MULTIPLIER), rounding) * 2 ** ridesWon;

/**
 * What a Gram round pays after `ridesWon` won rides, in whole nanotons: the first pot floored to the
 * nanoton, doubled exactly, never more than `maxWin` (`CoinFlipMath.PaidTon`).
 */
export const coinFlipPaidNano = (bet: GramBet, ridesWon: number, maxWin: string = GRAM_MAX_WIN): bigint => {
  // The first pot is uncapped here; `toGramNano` only floors it to the nanoton.
  const firstPot = toGramNano(bet, ratio(COIN_FLIP_WIN_MULTIPLIER), "1000000000");
  const pot = firstPot * 2n ** BigInt(ridesWon);
  const cap = toNano(maxWin);
  return pot < cap ? pot : cap;
};

/** The same payout as a decimal string ("30.4"), the way the app shows it. */
export const coinFlipPaidGram = (bet: GramBet, ridesWon: number, maxWin: string = GRAM_MAX_WIN) =>
  formatNano(coinFlipPaidNano(bet, ridesWon, maxWin));
