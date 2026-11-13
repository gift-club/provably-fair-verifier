/**
 * Crash (skins One Breath, Thin Ice and Moon Post) for the provably fair checker. Read 2026-10-03
 * (Moon Post's Cargo drop 2026-10-07) from:
 * - `CrashMath.DeriveCrashPoint`, `EffectiveCap`, `EffectiveCapTon`, `Plan`, `JudgeCashout`,
 *   `Payout`, `PayoutTon`;
 * - `CrashService.StartAsync` / `StartTonAsync` (float 0 of the round's nonce is the crash point;
 *   one nonce per paid round, Spark rounds use no nonce), `GetRoundingFloatAsync` (float 1 settles
 *   the sub-Star remainder of a Stars win) and `GetVerificationAsync` (`float`, `roundingFloat`);
 * - the `Crash` block of appsettings.json / `CrashOptions` (skins, `TargetRtp`, max wins).
 *
 * One engine, two skins: the skin changes the curve speed and the multiplier cap, never the draw.
 * The crash point is C = floor(100 · RTP / (1 − u)) / 100 from float u, and below 1.00 is a bust.
 * The server computes it in doubles; so does this file, in the same operation order. The round
 * snapshots `targetRtp` and `capMultiplier`, and settles on those, so the checker takes both.
 *
 * Which multiplier a hand cash-out landed on depends on when the tap arrived, which no seed can
 * show. The checker proves the crash point and the auto cash-out / ceiling ends, and that a
 * cash-out the player names was at or under the crash point; the payout then follows exactly.
 *
 * Moon Post (`CargoDrop`): a paid stake rides as two parcels (`CrashMath.Parcels`, the bigger
 * first; Gram in halves). The first can be dropped mid-flight by hand or at an auto-drop target,
 * and pays at once on float 2; the rest rides on to the eject or the end and pays on float 1,
 * under what the drop left of the max win. The drop's draw is a third float of the same nonce, so
 * the crash point and every round of the other skins verify unchanged.
 */
import { formatNano, type PfFloat, type Ratio, ratio, toGram, toGramNano, toNano, toStars } from "../provablyFair.js";

/**
 * Floats one round draws: Stars use float 1 to round the payout, Gram uses only float 0. A Moon
 * Post Stars round reads float 2 too, to round its drop.
 */
export const CRASH_FLOATS = { stars: 2, gram: 1, cargoStars: 3 } as const;

/** `CrashOptions.Skins`, keyed by the server's skin id (the verify response's `skin`). */
export const CRASH_SKINS = {
  freediver: { name: "One Breath", curveK: 0.10664, maxMultiplier: "1000" },
  "thin-ice": { name: "Thin Ice", curveK: 0.11552, maxMultiplier: "500" },
  "moon-post": { name: "Moon Post", curveK: 0.10664, maxMultiplier: "1000" },
} as const;
export type CrashSkin = keyof typeof CRASH_SKINS;

/** The skins whose paid rounds ride as two parcels (`CrashSkinOptions.CargoDrop`). */
export const CRASH_CARGO_SKINS: readonly CrashSkin[] = ["moon-post"];

/** `Crash:TargetRtp`; every skin uses it (no skin overrides it). */
export const CRASH_TARGET_RTP = "0.95";
/**
 * `Crash:MaxWinStars` / `MaxWinTon` since 2026-10-29. Unlike the other games, Crash's cap sets the round's
 * ceiling (`CrashMath.EffectiveCap`: ★100 on One Breath tops out at 25×, every Gram stake below 1000×), so the
 * checker must use today's caps. A round played before 2026-10-29 (caps ★10,000 / 1,000 GRAM) only replays
 * differently if it ran past today's ceiling.
 */
export const CRASH_MAX_WIN_STARS = 2500;
export const CRASH_MAX_WIN_GRAM = "25";
/** `CrashMath.MinCashout`, in cents. */
export const CRASH_MIN_CASHOUT_CENTS = 101;
/** `CrashMath.CrashPointCeiling`, in cents. */
const CRASH_POINT_CEILING_CENTS = 100_000_000;

/** Cents (247) to the server's two-decimal form ("2.47"). */
export const centsToMultiplier = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/** A multiplier such as "2.47" or "1000" to whole cents, floored (as `NormaliseAutoCashout` does). */
export const multiplierToCents = (multiplier: string): number => {
  const r = ratio(multiplier.trim());
  return Number((r.num * 100n) / r.den);
};

/**
 * `CrashMath.DeriveCrashPoint` in cents; 0 is a bust. Double maths exactly as the server does it:
 * `100.0 * (double)rtp / (1.0 - u)`, floored. `Number("0.95")` is the same double as `(double)0.95m`.
 */
export const crashPointCents = (u: PfFloat, rtp: string = CRASH_TARGET_RTP): number => {
  const raw = (100.0 * Number(rtp)) / (1.0 - u.value);
  if (raw >= CRASH_POINT_CEILING_CENTS) return CRASH_POINT_CEILING_CENTS;
  const cents = Math.floor(raw);
  return cents < 100 ? 0 : cents;
};

/**
 * `CrashMath.EffectiveCap` / `EffectiveCapTon`: the skin cap, lowered so bet × cap never passes the
 * max win, never under 1.01. Bets are whole Stars or a Gram tier ("0.1"). Returns cents.
 */
export const crashCapCents = (skin: CrashSkin, bet: string | number, currency: "stars" | "gram"): number => {
  let cap = multiplierToCents(CRASH_SKINS[skin].maxMultiplier);
  const b = ratio(String(bet));
  if (b.num > 0n) {
    const maxWin = ratio(currency === "stars" ? String(CRASH_MAX_WIN_STARS) : CRASH_MAX_WIN_GRAM);
    // floor(maxWin · 100 / bet), exactly
    const byWin = Number((maxWin.num * 100n * b.den) / (maxWin.den * b.num));
    cap = Math.min(cap, byWin);
  }
  return Math.max(cap, CRASH_MIN_CASHOUT_CENTS);
};

export type CrashEnd = "Bust" | "Crash" | "AutoCashout" | "MaxReached";

export interface CrashInputs {
  /** The round's `targetRtp`. */
  rtp?: string;
  /** The round's `capMultiplier`, e.g. "1000" or from `crashCapCents`. Defaults to One Breath's 1000. */
  cap?: string;
  /** The round's `autoCashout`, if one was set. */
  autoCashout?: string | null;
  /** A hand cash-out the player saw (`cashoutMultiplier`), to check against the crash point. */
  cashout?: string | null;
}

export interface CrashOutcome {
  /** "0.00" on a bust, else the crash point, e.g. "2.47". */
  crashPoint: string;
  bust: boolean;
  /** The round's natural end with no hand cash-out (`CrashMath.Plan`). */
  end: CrashEnd;
  /** Where that natural end stops: the crash point, the auto target or the ceiling. */
  endMultiplier: string;
  /**
   * Whether the named hand cash-out could have won: at least 1.01, not past the crash point, and
   * before the auto target or ceiling. Null when no cash-out was named.
   */
  cashoutValid: boolean | null;
  /** The multiplier the round paid: a valid hand cash-out, else the auto target or ceiling, else null. */
  paidMultiplier: string | null;
  /** `paidMultiplier` as an exact ratio, 0 when nothing was paid. */
  multiplier: Ratio;
  /** Float 1: rounds the sub-Star remainder of a Stars win. Absent when only one float was passed. */
  roundingFloat?: PfFloat;
}

/** Replays a paid Crash round from its floats (float 0, and float 1 for Stars). */
export const crashOutcome = (floats: PfFloat[], inputs: CrashInputs = {}): CrashOutcome => {
  const crash = crashPointCents(floats[0], inputs.rtp ?? CRASH_TARGET_RTP);
  const cap = multiplierToCents(inputs.cap ?? CRASH_SKINS.freediver.maxMultiplier);
  const auto = inputs.autoCashout ? multiplierToCents(inputs.autoCashout) : null;

  let end: CrashEnd;
  let endCents: number;
  if (crash < 100) {
    end = "Bust";
    endCents = 100;
  } else {
    let stop = cap;
    let stopEnd: CrashEnd = "MaxReached";
    if (auto !== null && auto < cap) {
      stop = auto;
      stopEnd = "AutoCashout";
    }
    if (crash >= stop) {
      end = stopEnd;
      endCents = stop;
    } else {
      end = "Crash";
      endCents = crash;
    }
  }

  // CrashMath.JudgeCashout: a tap is past the end at m > C on a crash, m ≥ stop on a paying end.
  let cashoutValid: boolean | null = null;
  let paid: number | null = end === "AutoCashout" || end === "MaxReached" ? endCents : null;
  if (inputs.cashout) {
    const m = multiplierToCents(inputs.cashout);
    const pastEnd = end === "Bust" || (end === "Crash" ? m > endCents : m >= endCents);
    cashoutValid = !pastEnd && m >= CRASH_MIN_CASHOUT_CENTS;
    if (cashoutValid) paid = m;
  }

  const paidMultiplier = paid === null ? null : centsToMultiplier(paid);
  return {
    crashPoint: centsToMultiplier(crash),
    bust: end === "Bust",
    end,
    endMultiplier: centsToMultiplier(endCents),
    cashoutValid,
    paidMultiplier,
    multiplier: paidMultiplier === null ? { num: 0n, den: 1n } : ratio(paidMultiplier),
    roundingFloat: floats[1],
  };
};

/** `CrashMath.Payout`: Stars for a win at `paidMultiplier`, rounded on float 1, capped. */
export const crashStars = (bet: number, paidMultiplier: string | null, roundingFloat: PfFloat): number =>
  paidMultiplier === null ? 0 : Math.min(toStars(bet, ratio(paidMultiplier), roundingFloat), CRASH_MAX_WIN_STARS);

/** `CrashMath.PayoutTon`: Gram for a win, floored to the nanoton, capped at 1000. */
export const crashGram = (bet: string, paidMultiplier: string | null): string =>
  paidMultiplier === null ? "0" : toGram(bet, ratio(paidMultiplier), CRASH_MAX_WIN_GRAM);

// ── Moon Post: the Cargo drop ────────────────────────────────────────────────────────────────

/** `CrashMath.Parcels`: a Stars stake as two parcels, the bigger one first (★5 → 3 + 2). Only for ★2 and up: ★1 flies as one parcel, no drop. */
export const crashParcels = (bet: number): { first: number; second: number } => {
  const first = Math.floor((bet + 1) / 2);
  return { first, second: bet - first };
};

/** `CrashMath.ParcelsTon`: a Gram stake in halves, any odd nanoton on the first. */
export const crashParcelsGram = (bet: string): { first: string; second: string } => {
  const total = toNano(bet);
  const second = total / 2n;
  return { first: formatNano(total - second), second: formatNano(second) };
};

export interface CrashCargoInputs extends CrashInputs {
  /** The round's `autoDrop`, if one was set. */
  autoDrop?: string | null;
  /** A hand drop the player saw (`dropMultiplier` on a round whose `dropAuto` is false). */
  drop?: string | null;
}

export interface CrashCargoOutcome extends CrashOutcome {
  /** Whether the named hand drop could have dropped. Null when no hand drop was named. */
  dropValid: boolean | null;
  /** Where the first parcel was dropped, or null when it rode with the rest. */
  dropMultiplier: string | null;
  /** Whether that drop was the auto-drop. */
  dropAuto: boolean;
  /** Float 2: rounds the sub-Star remainder of a Stars drop. Absent when only two floats were passed. */
  dropRoundingFloat?: PfFloat;
}

/**
 * Replays a paid Moon Post round. The server judges each tap by the time it arrived; on one curve a
 * later time is a higher multiplier, so the checker judges by the multiplier the player saw:
 * - a hand drop is valid under the cash-out's guards, and only below an auto-drop target the round
 *   reached (past it, the parcel had already gone at the target);
 * - the auto-drop happens when the crash point reaches its target, unless the player ejected before
 *   the plane got there;
 * - the rest is paid at a valid eject (at or after the drop), else at the auto cash-out or ceiling,
 *   else it crashed.
 */
export const crashCargoOutcome = (floats: PfFloat[], inputs: CrashCargoInputs = {}): CrashCargoOutcome => {
  const base = crashOutcome(floats, inputs);
  const crash = multiplierToCents(base.crashPoint);
  const end = multiplierToCents(base.endMultiplier);
  const target = inputs.autoDrop ? multiplierToCents(inputs.autoDrop) : null;
  const autoHappens = target !== null && !base.bust && crash >= target;
  const eject = base.cashoutValid ? multiplierToCents(base.paidMultiplier!) : null;

  let dropValid: boolean | null = null;
  let drop: number | null = null;
  let dropAuto = false;
  if (inputs.drop) {
    const m = multiplierToCents(inputs.drop);
    const pastEnd = base.bust || (base.end === "Crash" ? m > end : m >= end);
    dropValid = !pastEnd && m >= CRASH_MIN_CASHOUT_CENTS && !(autoHappens && m >= target!)
      && (eject === null || m <= eject);
    if (dropValid) drop = m;
  }
  if (drop === null && autoHappens && (eject === null || eject >= target!)) {
    drop = target;
    dropAuto = true;
  }

  return {
    ...base,
    dropValid,
    dropMultiplier: drop === null ? null : centsToMultiplier(drop),
    dropAuto,
    dropRoundingFloat: floats[2],
  };
};

export interface CrashCargoPayout {
  drop: number;
  rest: number;
  total: number;
}

/** Stars a Moon Post round paid: the drop on float 2, the rest on float 1 under what the drop left of the max win. */
export const crashCargoStars = (bet: number, o: CrashCargoOutcome): CrashCargoPayout | null => {
  if (!o.roundingFloat || (o.dropMultiplier !== null && !o.dropRoundingFloat)) return null;
  const { first, second } = crashParcels(bet);
  const drop = o.dropMultiplier === null ? 0
    : Math.min(toStars(first, ratio(o.dropMultiplier), o.dropRoundingFloat!), CRASH_MAX_WIN_STARS);
  const aboard = o.dropMultiplier === null ? bet : second;
  const rest = o.paidMultiplier === null ? 0
    : Math.min(toStars(aboard, ratio(o.paidMultiplier), o.roundingFloat), CRASH_MAX_WIN_STARS - drop);
  return { drop, rest, total: drop + rest };
};

/** Gram a Moon Post round paid, each part floored to the nanoton, the rest under what the drop left of 1000. */
export const crashCargoGram = (bet: string, o: CrashCargoOutcome): { drop: string; rest: string; total: string } => {
  const { first, second } = crashParcelsGram(bet);
  const drop = o.dropMultiplier === null ? 0n : toGramNano(first, ratio(o.dropMultiplier), CRASH_MAX_WIN_GRAM);
  const aboard = o.dropMultiplier === null ? bet : second;
  const restCap = formatNano(toNano(CRASH_MAX_WIN_GRAM) - drop);
  const rest = o.paidMultiplier === null ? 0n : toGramNano(aboard, ratio(o.paidMultiplier), restCap);
  return { drop: formatNano(drop), rest: formatNano(rest), total: formatNano(drop + rest) };
};
