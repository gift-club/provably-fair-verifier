import { describe, expect, it } from "vitest";
import vectors from "./color-predict.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, ratio, toGram, toStars } from "../provablyFair.js";
import {
  COLOR_PREDICT_CHOICES,
  COLOR_PREDICT_FLOATS,
  COLOR_PREDICT_LEGACY_TABLES,
  COLOR_PREDICT_MULTIPLIERS,
  colorPredictColor,
  colorPredictOutcome,
} from "./color-predict.js";

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/color-predict.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];

describe.each(vectors.cases)("Color Predict vectors for nonce $nonce", (c) => {
  const floats = (n: number) => generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, n);

  it("draws the same floats and winning number", async () => {
    const f = await floats(COLOR_PREDICT_FLOATS.stars);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    const out = colorPredictOutcome(f, "red");
    expect(out.number).toBe(c.winningNumber);
    expect(out.color).toBe(c.winningColor);
    expect(out.isViolet).toBe(c.isViolet);
  });

  it("settles every bet and its Stars payout", async () => {
    const f = await floats(COLOR_PREDICT_FLOATS.stars);
    for (const choice of COLOR_PREDICT_CHOICES) {
      const expected = c.choices[choice];
      const out = colorPredictOutcome(f, choice);
      expect(out.win).toBe(expected.win);
      expect(out.multiplier).toBe(expected.multiplier);
      expect(BETS.map((b) => (out.win ? toStars(b, ratio(out.multiplier), out.roundingFloat!) : 0))).toEqual(expected.stars);
      const legacy = colorPredictOutcome(f, choice, COLOR_PREDICT_LEGACY_TABLES["2026-08-15"]);
      expect(BETS.map((b) => (legacy.win ? toStars(b, ratio(legacy.multiplier), legacy.roundingFloat!) : 0))).toEqual(
        expected.starsLegacy,
      );
    }
  });

  it("rounds every multiplier ever paid on this round's rounding float", async () => {
    const [, rounding] = await floats(COLOR_PREDICT_FLOATS.stars);
    for (const [m, stars] of Object.entries(c.rounding)) expect(BETS.map((b) => toStars(b, ratio(m), rounding))).toEqual(stars);
  });

  it("draws a Gram round from one float, the same roll", async () => {
    const out = colorPredictOutcome(await floats(COLOR_PREDICT_FLOATS.gram), "green");
    expect(out.number).toBe(c.gramNumber);
    expect(out.roundingFloat).toBeUndefined();
  });
});

describe("Color Predict tables", () => {
  it("carries the server's multipliers", () => {
    expect(COLOR_PREDICT_MULTIPLIERS).toEqual(vectors.multipliers);
    expect(COLOR_PREDICT_LEGACY_TABLES["2026-08-15"]).toEqual(vectors.legacyMultipliers);
  });

  it("colours and settles every number as the service does", () => {
    for (const row of vectors.table) {
      expect(colorPredictColor(row.number)).toBe(row.color);
      const roll = { value: (row.number + 0.5) / 10, uint: 0 };
      expect(COLOR_PREDICT_CHOICES.filter((ch) => colorPredictOutcome([roll], ch).win)).toEqual(row.wins);
    }
  });

  it("pays Gram on every tier", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
    expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(COLOR_PREDICT_MULTIPLIERS.red)))).toEqual(vectors.gram.redGreen);
    expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(COLOR_PREDICT_MULTIPLIERS.violet)))).toEqual(vectors.gram.violet);
  });
});
