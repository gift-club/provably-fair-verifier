import { describe, expect, it } from "vitest";
import vectors from "./plinko-gold.vectors.json";
import { generateFloats, hexToBytes, type PfFloat } from "../provablyFair.js";
import {
  PLINKO_GOLD_BONUS_PEG_COLUMNS,
  PLINKO_GOLD_BONUS_PEG_ROW,
  PLINKO_GOLD_MAX_WIN_GRAM,
  PLINKO_GOLD_MAX_WIN_STARS,
  PLINKO_GOLD_ROW_OPTIONS,
  PLINKO_GOLD_TABLES,
  PLINKO_GOLD_TABLES_AUG_2026,
  type PlinkoGoldRisk,
  type PlinkoGoldRows,
  plinkoGoldBonusStars,
  plinkoGoldBonusTriggered,
  plinkoGoldFloats,
  plinkoGoldGram,
  plinkoGoldOutcome,
  plinkoGoldStars,
  plinkoGoldStarsFloats,
} from "./plinko-gold.js";

/** Every expectation comes from the backend's own code: see `scripts/pf-vectors/plinko-gold.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];

/** Floats that bounce right exactly where `rawPath` has a set bit, for a wagered ball only. */
const floatsForPath = (rawPath: number, rows: number) =>
  Array.from({ length: rows * 2 }, (_, i) => ({ value: i < rows && (rawPath >> i) & 1 ? 0.75 : 0.25 }) as PfFloat);

describe("Plinko Gold constants", () => {
  it("match the server", () => {
    expect([...PLINKO_GOLD_ROW_OPTIONS]).toEqual(vectors.allowedRows);
    for (const rows of PLINKO_GOLD_ROW_OPTIONS) {
      expect(plinkoGoldFloats(rows)).toBe(vectors.floatsPerDrop[String(rows) as keyof typeof vectors.floatsPerDrop]);
      expect(plinkoGoldStarsFloats(rows)).toBe(vectors.floatsPerStarsDrop[String(rows) as keyof typeof vectors.floatsPerStarsDrop]);
    }
    expect(PLINKO_GOLD_BONUS_PEG_ROW).toBe(vectors.bonusPegRow);
    expect([...PLINKO_GOLD_BONUS_PEG_COLUMNS]).toEqual(vectors.bonusPegColumns);
    expect(PLINKO_GOLD_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(PLINKO_GOLD_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    expect(PLINKO_GOLD_TABLES).toEqual(vectors.tables);
  });

  it("keeps the August 2026 tables symmetric with every multiplier on the 0.2 grid", () => {
    for (const table of Object.values(PLINKO_GOLD_TABLES_AUG_2026)) {
      expect(table).toEqual([...table].reverse());
      for (const m of table) expect(Math.round(Number(m) * 10) % 2).toBe(0);
    }
  });

  it.each(PLINKO_GOLD_ROW_OPTIONS)("reads every sampled %i-row path like the server", (rows) => {
    for (const [rawPath, slot, bonus] of vectors.paths[String(rows) as keyof typeof vectors.paths]) {
      expect(plinkoGoldBonusTriggered(rawPath)).toBe(bonus === 1);
      const out = plinkoGoldOutcome(floatsForPath(rawPath, rows), "low", rows);
      expect(out.ball.rawPath).toBe(rawPath);
      expect(out.ball.slot).toBe(slot);
    }
  });

  it.each(vectors.capCases)("caps a $rows-row $risk drop of $combined at the ceiling", (c) => {
    expect(BETS.map((b) => plinkoGoldStars(b, c.combined))).toEqual(c.stars);
    const high = { value: 0.999, uint: Math.floor(0.999 * 2 ** 32) } as PfFloat;
    expect(BETS.map((b) => plinkoGoldStars(b, c.combined, high))).toEqual(c.starsRounded);
    expect(vectors.tonTiers.map((b) => plinkoGoldGram(b, c.combined))).toEqual(c.gram);
  });
});

describe.each(vectors.cases)("Plinko Gold vectors for $rows rows, nonce $nonce", (c) => {
  it("drops both balls and pays them in Stars and Gram", async () => {
    const rows = c.rows as PlinkoGoldRows;
    // A Stars drop draws one float more, at 2 × rows: the same stream, so the first 2 × rows are the Gram drop's.
    const drawn = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, plinkoGoldStarsFloats(rows));
    const floats = drawn.slice(0, plinkoGoldFloats(rows));
    const rounding = drawn[plinkoGoldFloats(rows)];
    expect(floats).toHaveLength(c.floats.length);
    floats.forEach((f, i) => expect(f.value).toBe(c.floats[i]));
    expect(rounding.value).toBe(c.roundingFloat);

    for (const [risk, r] of Object.entries(c.risks)) {
      const out = plinkoGoldOutcome(floats, risk as PlinkoGoldRisk, rows);
      expect(out.ball.rawPath).toBe(c.rawPath);
      expect(out.ball.slot).toBe(c.finalSlot);
      expect(out.bonusTriggered).toBe(c.bonusTriggered);
      expect(out.golden?.rawPath ?? null).toBe(c.bonusRawPath);
      expect(out.golden?.slot ?? null).toBe(c.bonusFinalSlot);
      expect(out.ball.multiplier).toBe(r.multiplier);
      expect(out.golden?.multiplier ?? null).toBe(r.bonusMultiplier);
      expect(out.multiplier).toBe(r.combined);
      // A round from before ★1 bets stored no rounding float and truncated: the old payout.
      expect(BETS.map((b) => plinkoGoldStars(b, out.multiplier))).toEqual(r.stars);
      expect(out.golden ? BETS.map((b) => plinkoGoldBonusStars(b, out.golden!.multiplier, out.multiplier)) : null).toEqual(r.bonusStars);
      expect(BETS.map((b) => plinkoGoldStars(b, out.multiplier, rounding))).toEqual(r.starsRounded);
      expect(out.golden ? BETS.map((b) => plinkoGoldBonusStars(b, out.golden!.multiplier, out.multiplier, rounding)) : null).toEqual(r.bonusStarsRounded);
      // At a multiple of 5 the rounding float changes nothing, so older rounds replay as they were paid.
      BETS.forEach((b, i) => {
        if (b % 5 === 0) expect(r.starsRounded[i]).toBe(r.stars[i]);
      });
      expect(vectors.tonTiers.map((b) => plinkoGoldGram(b, out.multiplier))).toEqual(r.gram);
    }
  });
});
