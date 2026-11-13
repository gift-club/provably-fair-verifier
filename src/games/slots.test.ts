import { describe, expect, it } from "vitest";
import vectors from "./slots.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, toGram } from "../provablyFair.js";
import {
  SLOTS_MAX_WIN_GRAM,
  SLOTS_MAX_WIN_STARS,
  SLOTS_PICK_ITEMS,
  SLOTS_RULE_SET_VERSIONS,
  SLOTS_RULE_SETS,
  SLOTS_STARS_BETS,
  slotsMaxFloats,
  slotsFloatsFor,
  slotsOutcome,
  slotsRoundingFloat,
  slotsStarsPayout,
  slotsSymbolFromFloat,
  type SlotsOutcome,
  type SlotsRuleSetVersion,
} from "./slots.js";

/**
 * Every expectation below was produced by the backend's own code — see
 * `scripts/pf-vectors/slots.cs`. `result` is the round exactly as `SlotsPaidService` stores it
 * (`ResultJson`), so the port is pinned grid by grid, tumble by tumble, free spin by free spin.
 */

// The stored JSON: no exact ratio, no tumble or float count; freeSpins, pick and walk left out when null.
// pickMultiplier and walkMultiplier are always there (0 on a set with no bonus games).
const asStored = (o: SlotsOutcome) => {
  const { totalRatio: _r, tumbleCount: _t, floatsConsumed: _f, freeSpins, pick, walk, ...rest } = o;
  return { ...rest, ...(freeSpins ? { freeSpins } : {}), ...(pick ? { pick } : {}), ...(walk ? { walk } : {}) };
};

describe("Slots rule sets", () => {
  it("match the server's numbered sets", () => {
    for (const [v, r] of Object.entries(vectors.rules)) {
      const mine = SLOTS_RULE_SETS[Number(v) as SlotsRuleSetVersion];
      expect(mine.risk).toBe(r.risk);
      expect(mine.minMatch).toBe(r.minMatch);
      expect(mine.thresholds).toEqual(r.thresholds);
      expect(mine.payTenths.map((row) => row.map((t) => t / 10))).toEqual(r.payTable);
      expect(mine.cascadeMultipliers).toEqual(r.cascadeMultipliers);
      expect(mine.scatterId).toBe(r.scatterId);
      expect(mine.freeSpinsTrigger).toBe(r.freeSpinsTrigger);
      expect(mine.freeSpinsBase).toBe(r.freeSpinsBase);
      expect(mine.freeSpinsPerExtraScatter).toBe(r.freeSpinsPerExtraScatter);
      expect(mine.maxScattersCounted).toBe(r.maxScattersCounted);
      expect(mine.maxWinMultiplier).toBe(r.maxWinMultiplier);
      expect(mine.giftsCountAfterTumbles ?? false).toBe(r.giftsCountAfterTumbles);
      expect(mine.freeSpinsRetrigger ?? 0).toBe(r.freeSpinsRetrigger);
      expect(mine.freeSpinsRetrigger ? mine.maxFreeSpins : 0).toBe(r.maxFreeSpins);
      const b = mine.bonus;
      if (!("bonus" in r) || !r.bonus) {
        expect(b).toBeUndefined();
      } else {
        expect(b?.pickSymbolId).toBe(r.bonus.pickSymbolId);
        expect(b?.walkSymbolId).toBe(r.bonus.walkSymbolId);
        expect(b?.trigger).toBe(r.bonus.trigger);
        expect(b?.pickPrizes).toEqual(r.bonus.pickPrizes);
        expect(b?.walkBoard).toEqual(r.bonus.walkBoard);
        expect(b?.walkRolls).toBe(r.bonus.walkRolls);
        expect(b?.walkMaxExtraRolls).toBe(r.bonus.walkMaxExtraRolls);
        expect(b?.walkDieFaces).toBe(r.bonus.walkDieFaces);
        expect(b?.pickWeights.length).toBe(r.bonus.pickPrizes.length);
        expect(SLOTS_PICK_ITEMS).toBe(r.bonus.pickItems);
      }
      // Weights are not served; the symbol rolls below pin them. Bonus symbols are the last two weights.
      expect(mine.symbolWeights.length).toBe(b ? 11 : 9);
      expect(slotsMaxFloats(Number(v) as SlotsRuleSetVersion)).toBe(vectors.maxFloats[v as keyof typeof vectors.maxFloats]);
    }
    expect(SLOTS_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(SLOTS_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    expect([...GRAM_BET_TIERS]).toEqual(vectors.tonTiers);
  });

  it("rolls symbols with the server's double maths", () => {
    for (const [v, rolls] of Object.entries(vectors.symbolRolls)) {
      const rules = SLOTS_RULE_SETS[Number(v) as SlotsRuleSetVersion];
      for (const { roll, symbol, gridSymbol } of rolls) {
        expect(slotsSymbolFromFloat(roll, rules)).toBe(symbol);
        expect(slotsSymbolFromFloat(roll, rules, false)).toBe(gridSymbol);
      }
    }
  });
});

describe.each(vectors.cases)("Slots v$version nonce $nonce ($why)", (c) => {
  const version = c.version as SlotsRuleSetVersion;
  const seed = hexToBytes(c.serverSeed);

  it("replays the stored round, its payouts in Stars and Gram", async () => {
    const out = slotsOutcome(await generateFloats(seed, c.clientSeed, c.nonce, slotsMaxFloats(version)), version);
    expect(asStored(out)).toEqual(c.result);
    expect(out.floatsConsumed).toBe(c.floatsConsumed);
    expect(out.tumbleCount).toBe(c.tumbleCount);
    // A Stars spin draws one float more: the first the round left unused rounds its payout.
    const drawn = await generateFloats(seed, c.clientSeed, c.nonce, slotsFloatsFor.stars(version));
    const rounding = slotsRoundingFloat(drawn, out);
    expect(rounding?.value).toBe(c.roundingFloat);
    // A round from before ★1 bets stored no rounding float and floored: the old payout.
    expect(SLOTS_STARS_BETS.map((b) => slotsStarsPayout(b, out))).toEqual(c.stars);
    expect(SLOTS_STARS_BETS.map((b) => slotsStarsPayout(b, out, rounding))).toEqual(c.starsRounded);
    // At a multiple of 5 the float changes nothing, so older rounds replay as they were paid.
    SLOTS_STARS_BETS.forEach((b, i) => {
      if (b % 5 === 0) expect(c.starsRounded[i]).toBe(c.stars[i]);
    });
    expect(GRAM_BET_TIERS.map((b) => toGram(b, out.totalRatio, SLOTS_MAX_WIN_GRAM))).toEqual(c.gram);
  });

  it("replays from exactly the floats the verify endpoint returns", async () => {
    const out = slotsOutcome(await generateFloats(seed, c.clientSeed, c.nonce, c.floatsConsumed), version);
    expect(asStored(out)).toEqual(c.result);
    // verify returns floatsConsumed + 1 floats for a new Stars round: the last is the rounding float.
    const withRounding = await generateFloats(seed, c.clientSeed, c.nonce, c.floatsConsumed + 1);
    expect(slotsRoundingFloat(withRounding, out)?.value).toBe(c.roundingFloat);
    await expect(async () =>
      slotsOutcome(await generateFloats(seed, c.clientSeed, c.nonce, c.floatsConsumed - 1), version),
    ).rejects.toThrow(/floats/);
  });
});

describe("Slots vectors cover every rule set and bonus game", () => {
  it("has rounds for V1-V21, the pick, the walk, both, doubles, extra rolls, late Gifts and retriggers", () => {
    expect(SLOTS_RULE_SET_VERSIONS).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    for (const v of SLOTS_RULE_SET_VERSIONS) expect(vectors.cases.some((c) => c.version === v)).toBe(true);
    const bonusSets = SLOTS_RULE_SET_VERSIONS.filter((v) => v >= 10);
    for (const v of bonusSets) {
      const mine = vectors.cases.filter((c) => c.version === v);
      expect(mine.some((c) => "pick" in c.result), `V${v} pick`).toBe(true);
      expect(mine.some((c) => "walk" in c.result), `V${v} walk`).toBe(true);
      expect(mine.some((c) => "pick" in c.result && "walk" in c.result), `V${v} both`).toBe(true);
      expect(mine.some((c) => "walk" in c.result && c.result.walk?.steps.some((s) => s.doubled)), `V${v} double`).toBe(true);
    }
    // V16 on: free spins opened by a Gift that fell in on a tumble, and a free spin that added spins.
    for (const v of SLOTS_RULE_SET_VERSIONS.filter((v) => v >= 16)) {
      const mine = vectors.cases.filter((c) => c.version === v);
      expect(mine.some((c) => c.why === "late-gift"), `V${v} late Gift`).toBe(true);
      expect(
        mine.some((c) => c.result.freeSpins?.some((s: { freeSpinsAdded?: number | null }) => (s.freeSpinsAdded ?? 0) > 0)),
        `V${v} retrigger`,
      ).toBe(true);
    }
    expect(vectors.cases.some((c) => "pick" in c.result && c.result.pick?.prize === 3)).toBe(true);
    expect(vectors.cases.some((c) => "walk" in c.result && c.result.walk?.steps.filter((s) => s.extraRoll).length === 2)).toBe(true);
  });
});
