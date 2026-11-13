/**
 * Magic Door for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-03:
 * - `MagicDoorPaidService.PlayPaidAsync` / `PlayPaidTonAsync`: five floats either way
 *   (`MagicDoorMath.FloatsRequired`). Floats 0–3 shuffle the table, float 4 is the
 *   `PayoutCalculator.ToStars` rounding float. A Gram round draws it too and leaves it unused.
 * - `MagicDoorMath.ShuffleMultipliers`: Fisher–Yates from the last door down, door i swapping
 *   with j = min(floor(f × (i + 1)), i). The player's door (0-based `selectedDoor`) pays what
 *   lands behind it. No reveal and no switch: this is not the free game's Monty Hall.
 * - `MagicDoorMath.Multipliers`: 0, 0, 0.5, 1.25, 3.0. Stars tiers are 1 and the multiples of 4
 *   (8 / 20 / 40 / 100 / 200): at a multiple of 4 every Stars payout is whole and the rounding float
 *   never moves it, and at ★1 (0.5, 1.25 or 3) the float rounds the payout, exact in expectation. Gram pays `TonPayoutCalculator.ToTon` capped at `MaxWinTon` (1000 GRAM).
 *
 * The verify response returns the stored layout (`doorMultipliers`), so the table a round used
 * shows in it: a 1.4 means the 2026-08-15 to 2026-08-18 table, where the rounding float did
 * matter (8 × 1.4 = 11.2). Rounds before 2026-08-15 drew only the four shuffle floats; their
 * layout replays the same. Pinned by `magic-door.test.ts` against `scripts/pf-vectors/magic-door.cs`.
 */
import type { PfFloat } from "../provablyFair.js";

export const MAGIC_DOOR_COUNT = 5;

/** Floats one round draws, Stars and Gram alike; rounds before 2026-08-15 drew 4. */
export const MAGIC_DOOR_FLOATS = { stars: 5, gram: 5, legacy: 4 } as const;

export const MAGIC_DOOR_ROUNDING_FLOAT_INDEX = 4;

/** MagicDoor BetTiers, appsettings.json. */
export const MAGIC_DOOR_BET_TIERS = [1, 8, 20, 40, 100, 200];

/** MagicDoorMath.Multipliers, in the order the shuffle starts from. */
export const MAGIC_DOOR_TABLE = ["0", "0", "0.5", "1.25", "3.0"];

/** The table of 2026-08-15 to 2026-08-18. */
export const MAGIC_DOOR_LEGACY_TABLE = ["0", "0", "0.5", "1.4", "3.0"];

/** Which table a stored layout came from. */
export const magicDoorTableOf = (doorMultipliers: (string | number)[]) =>
  doorMultipliers.some((m) => Number(m) === 1.4) ? MAGIC_DOOR_LEGACY_TABLE : MAGIC_DOOR_TABLE;

/** MagicDoorMath.ShuffleMultipliers on the given table. */
export const magicDoorShuffle = (floats: PfFloat[], table: string[] = MAGIC_DOOR_TABLE) => {
  const doors = [...table];
  for (let i = doors.length - 1, f = 0; i > 0; i--, f++) {
    const j = Math.min(Math.trunc(floats[f].value * (i + 1)), i);
    [doors[i], doors[j]] = [doors[j], doors[i]];
  }
  return doors;
};

/** One round: the whole layout, what the picked door (0-based) pays, and the rounding float. */
export const magicDoorOutcome = (floats: PfFloat[], selectedDoor: number, table: string[] = MAGIC_DOOR_TABLE) => {
  const doors = magicDoorShuffle(floats, table);
  return {
    doors,
    selectedDoor,
    multiplier: doors[selectedDoor],
    roundingFloat: floats[MAGIC_DOOR_ROUNDING_FLOAT_INDEX] as PfFloat | undefined,
  };
};
