import { describe, expect, it } from "vitest";
import vectors from "./rock-paper-scissors.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, ratio, toGram, toStars } from "../provablyFair.js";
import {
  RPS_LEGACY_MULTIPLIERS,
  RPS_MAX_ROUNDS,
  RPS_MULTIPLIERS,
  RPS_PAYOUT_SUFFIX,
  RPS_SIGN_COUNT,
  rpsHouseChoices,
  rpsMultiplierAt,
  rpsOutcome,
  rpsResult,
  type RpsVariant,
} from "./rock-paper-scissors.js";

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/rock-paper-scissors.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];

describe.each(vectors.cases)("Rock Paper Scissors vectors for nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);

  it("draws the house hand of every throw in both variants", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, c.floats.length);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    for (const [variant, game] of Object.entries(c.games)) expect(rpsHouseChoices(f, variant as RpsVariant)).toEqual(game.house);
  });

  it("replays whole games throw by throw", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, c.floats.length);
    for (const [variant, game] of Object.entries(c.games)) {
      for (const replay of [game.alwaysRock, game.cycling, game.perfect]) {
        const hands = replay.throws.map((t) => t.player);
        const out = rpsOutcome(f, variant as RpsVariant, hands);
        expect(out.throws).toEqual(replay.throws.map((t) => ({ ...t, result: t.result })));
        expect(out.wins).toBe(replay.wins);
        expect(out.lost).toBe(replay.lost);
        expect(out.multiplier).toBe(replay.multiplier);
        expect(out.forcedCashOut).toBe(replay.wins === RPS_MAX_ROUNDS);
      }
    }
  });

  it("settles a Stars cash-out on the separate payout stream, at every rung", async () => {
    const [rounding] = await generateFloats(seed, `${c.clientSeed}${RPS_PAYOUT_SUFFIX}`, c.nonce, 1);
    expect(rounding.value).toBe(c.roundingFloat);
    // The forced cash-out after the fifth win settles on the same draw: bet × 30.40 is 30 or 31 at ★1.
    c.stars.forEach((stars, rung) =>
      expect(BETS.map((b) => toStars(b, ratio(rpsMultiplierAt(rung)), rounding))).toEqual(stars),
    );
    c.starsLegacy.forEach((stars, i) => expect(BETS.map((b) => toStars(b, ratio(RPS_LEGACY_MULTIPLIERS[i]), rounding))).toEqual(stars));
  });
});

describe("Rock Paper Scissors rules", () => {
  it("carries the server's ladder", () => {
    expect(RPS_MULTIPLIERS).toEqual(vectors.ladder);
    expect(RPS_MULTIPLIERS).toEqual(vectors.ladders.Classic);
    expect(RPS_MULTIPLIERS).toEqual(vectors.ladders.LizardSpock);
    expect(RPS_LEGACY_MULTIPLIERS).toEqual(vectors.legacyLadder);
    expect(RPS_MAX_ROUNDS).toBe(vectors.maxRounds);
  });

  it("decides every pair of hands as RockPaperScissorsMath.Outcome does", () => {
    for (const [variant, rows] of Object.entries(vectors.outcomes)) {
      const v = variant as RpsVariant;
      expect(rows).toHaveLength(RPS_SIGN_COUNT[v]);
      rows.forEach((row, player) => row.forEach((result, house) => expect(rpsResult(player, house, v)).toBe(result)));
    }
  });

  it("pays a Gram cash-out on every tier at every rung", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
    vectors.gram.rungs.forEach((gram, rung) => expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(rpsMultiplierAt(rung))))).toEqual(gram));
  });
});
