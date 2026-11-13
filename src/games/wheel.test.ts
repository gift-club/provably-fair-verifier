import { describe, expect, it } from "vitest";
import vectors from "./wheel.vectors.json";
import { generateFloats, hexToBytes, type PfFloat } from "../provablyFair.js";
import {
  WHEEL_FLOAT_BLOCK,
  WHEEL_MAX_WIN_GRAM,
  WHEEL_MAX_WIN_STARS,
  WHEEL_TABLES,
  wheelDrawFromFloats,
  wheelGram,
  wheelLayout,
  wheelStars,
  type WheelRisk,
  type WheelSegments,
} from "./wheel.js";

const asFloat = (value: number): PfFloat => ({ value, uint: Math.round(value * 4294967296) });

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/wheel.cs`. */
describe.each(vectors.cases)("Wheel vectors for nonce $nonce", (c) => {
  it.each(c.draws)("draws and settles on $segments segments", async (d) => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, WHEEL_FLOAT_BLOCK);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    const draw = wheelDrawFromFloats(f, d.segments);
    if (!draw) throw new Error("no segment");
    expect(draw.segment).toBe(d.segment);
    expect(draw.restOffset).toBe(d.restOffset);
    expect(draw.candidateIndex).toBe(d.candidateIndex);
    expect(draw.roundingFloat.value).toBe(d.roundingFloat);
    for (const s of d.settle) {
      const multiple = wheelLayout(s.risk as WheelRisk, d.segments as WheelSegments)[draw.segment];
      expect(multiple).toBe(s.multiplier);
      for (const b of s.stars) expect(wheelStars(b.bet, multiple, draw.roundingFloat)).toBe(b.payout);
      for (const b of s.gram) expect(wheelGram(b.bet, multiple)).toBe(b.payout);
    }
  });
});

describe("Wheel rules", () => {
  it("carries the server's tables and layouts", () => {
    expect(vectors.tables).toHaveLength(15);
    for (const t of vectors.tables) {
      expect(WHEEL_TABLES[t.key as keyof typeof WHEEL_TABLES]).toEqual(t.groups);
      const [risk, segments] = t.key.split(":");
      expect(wheelLayout(risk as WheelRisk, Number(segments) as WheelSegments)).toEqual(t.layout);
    }
  });

  it("carries the server's limits", () => {
    expect(WHEEL_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(WHEEL_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    expect(wheelStars(100, "47.5", asFloat(0.5))).toBe(vectors.capped.stars);
    expect(wheelGram("10", "47.5")).toBe(vectors.capped.gram);
  });

  it("skips rejected candidates and rounds on the float after the accepted one", () => {
    for (const r of vectors.rejection) {
      const draw = wheelDrawFromFloats(r.floats.map(asFloat), r.segments);
      expect(draw?.segment).toBe(r.segment);
      expect(draw?.restOffset).toBe(r.restOffset);
      expect(draw?.candidateIndex).toBe(r.candidateIndex);
      expect(draw?.roundingFloat.value).toBe(r.roundingFloat);
    }
  });
});
