import { describe, expect, it } from "vitest";
import vectors from "./roulette.vectors.json";
import { generateFloats, hexToBytes, type PfFloat } from "../provablyFair.js";
import {
  ROULETTE_BETS,
  ROULETTE_FLOAT_BLOCK,
  ROULETTE_MAX_WIN_GRAM,
  ROULETTE_MAX_WIN_STARS,
  ROULETTE_PAY_TABLE,
  ROULETTE_RED,
  ROULETTE_REJECTION_LIMIT,
  parseRouletteBets,
  rouletteGram,
  roulettePocketFromFloats,
  rouletteSettle,
  rouletteStars,
} from "./roulette.js";

const asFloat = (value: number): PfFloat => ({ value, uint: Math.round(value * 4294967296) });

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/roulette.cs`. */
describe.each(vectors.cases)("Roulette vectors for nonce $nonce", (c) => {
  it("draws the pocket and the rounding float", async () => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, ROULETTE_FLOAT_BLOCK);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    const draw = roulettePocketFromFloats(f);
    expect(draw?.pocket).toBe(c.pocket);
    expect(draw?.candidateIndex).toBe(c.candidateIndex);
    expect(draw?.roundingFloat.value).toBe(c.roundingFloat);
  });

  it("settles Stars and Gram layouts", async () => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, ROULETTE_FLOAT_BLOCK);
    const draw = roulettePocketFromFloats(f);
    if (!draw) throw new Error("no pocket");
    for (const l of c.stars) {
      const { exact } = rouletteSettle(l.bets, draw.pocket);
      expect(Number(exact.num) / Number(exact.den)).toBeCloseTo(Number(l.exact), 9);
      expect(rouletteStars(exact, draw.roundingFloat)).toBe(l.payout);
    }
    for (const l of c.gram) expect(rouletteGram(rouletteSettle(l.bets, draw.pocket).exact)).toBe(l.payout);
  });
});

describe("Roulette rules", () => {
  it("carries the server's pay table, catalogue, wheel colours and limits", () => {
    expect(ROULETTE_PAY_TABLE).toEqual(vectors.payTable);
    expect(ROULETTE_REJECTION_LIMIT).toBe(vectors.rejectionLimit);
    expect(ROULETTE_RED).toEqual(vectors.red);
    expect(ROULETTE_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(ROULETTE_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    expect(Object.fromEntries([...ROULETTE_BETS].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))).toEqual(vectors.catalogue);
  });

  it("skips rejected candidates and rounds on the float after the accepted one", () => {
    const draw = roulettePocketFromFloats(vectors.rejection.floats.map(asFloat));
    expect(draw?.pocket).toBe(vectors.rejection.pocket);
    expect(draw?.candidateIndex).toBe(vectors.rejection.candidateIndex);
    expect(draw?.roundingFloat.value).toBe(vectors.rejection.roundingFloat);
  });

  it("reads bets as the server keys them", () => {
    expect(parseRouletteBets("red 25, split:17,20 10, 17 5, straight:17 5, nope 3")).toEqual({
      bets: [
        { key: "red", stake: "25" },
        { key: "split:17,20", stake: "10" },
        { key: "straight:17", stake: "10" },
      ],
      unknown: ["nope"],
    });
    expect(parseRouletteBets("split:17,18 5").unknown).toEqual([]);
    expect(parseRouletteBets("split:17,22 5").unknown).toEqual(["split:17,22"]);
    // Malformed parts are reported, never re-read as a straight on the stake's digits.
    expect(parseRouletteBets("red: 25, straight:17 ★5")).toEqual({
      bets: [
        { key: "red", stake: "25" },
        { key: "straight:17", stake: "5" },
      ],
      unknown: [],
    });
    expect(parseRouletteBets("17,20 10")).toEqual({ bets: [], unknown: ["17,20 10"] });
    expect(parseRouletteBets("17 — 5")).toEqual({ bets: [], unknown: ["17 — 5"] });
  });
});
