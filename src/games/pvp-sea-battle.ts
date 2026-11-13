/**
 * PvP Sea Battle, for the provably fair checker. The deal itself (`SEA_WAR`, `seaWarDeal`,
 * `seaWarDealFromFloats`, `seaWarLayoutNonce`) lives in `../provablyFair` and was re-checked
 * against `PvpSeaWarMath` and `PvpSeaWarService` on 2026-10-03: unchanged. Added here, read
 * 2026-10-03: every layout a side can reach, and `PvpSeaWarMath.FleetCommitment`, the
 * fingerprint that proves a hand-placed fleet.
 *
 * Float layout, all from the match's own seed:
 * - base nonce: float 0 who shoots first (`CreatorShootsFirst`, creator when below 0.5),
 *   float 1 the payout rounding draw.
 * - layout k of each side (k = 0 is the first deal, each shuffle moves one on, up to
 *   MaxShuffles 99, so 100 layouts per side): 16 floats (4 ships × 4 deal attempts) at nonce base + 1 + 2k + (0 creator,
 *   1 opponent).
 *
 * A side that moved ships by hand played its own fleet, not a dealt one. It is proved by its
 * commitment, HMAC_SHA256(serverSeed, "seawar-fleet:{role}:{cells}") over every occupied cell
 * ascending, which the app shows to both players when the battle starts and keeps afterwards.
 * The bot's shots and placement come from the CSPRNG, not the seed, so they are not checkable.
 */
import { bytesToHex, generateFloats, SEA_WAR, type SeaWarRole, type SeaWarShip, seaWarDealFromFloats, seaWarLayoutNonce } from "../provablyFair.js";

export { SEA_WAR, seaWarDeal, seaWarLayoutNonce, type SeaWarRole, type SeaWarShip } from "../provablyFair.js";

export const PVP_SEA_BATTLE_BASE = {
  baseFloatCount: 2,
  firstMoverFloatIndex: 0,
  roundingFloatIndex: 1,
} as const;

export interface SeaWarLayout {
  layoutIndex: number;
  nonce: number;
  ships: SeaWarShip[];
}

/** Every layout one side could reach: 0 through `SEA_WAR.maxShuffles`. */
export const seaWarLayouts = async (
  serverSeed: Uint8Array,
  clientSeed: string,
  baseNonce: number,
  role: SeaWarRole,
): Promise<SeaWarLayout[]> =>
  Promise.all(
    Array.from({ length: SEA_WAR.maxShuffles + 1 }, async (_, layoutIndex) => {
      const nonce = seaWarLayoutNonce(baseNonce, role, layoutIndex);
      const floats = await generateFloats(serverSeed, clientSeed, nonce, SEA_WAR.fleet.length * SEA_WAR.dealAttempts);
      return { layoutIndex, nonce, ships: seaWarDealFromFloats(floats) };
    }),
  );

/**
 * PvpSeaWarMath.FleetCommitment: lower-case hex HMAC-SHA256 keyed with the raw server seed over
 * "seawar-fleet:{role}:{cells}", cells being every occupied cell (row × 7 + col) ascending,
 * comma-separated. Ship order does not matter.
 */
export const seaWarFleetCommitment = async (serverSeed: Uint8Array, role: SeaWarRole, cells: readonly number[]) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser does not support Web Crypto, which the checker needs.");
  const key = await subtle.importKey("raw", serverSeed as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sorted = [...cells].sort((a, b) => a - b).join(",");
  const message = new TextEncoder().encode(`seawar-fleet:${role}:${sorted}`);
  return bytesToHex(new Uint8Array(await subtle.sign("HMAC", key, message as BufferSource)));
};
