import { describe, expect, it } from "vitest";
import vectors from "./crossing.vectors.json";
import { generateFloats, GRAM_BET_TIERS, GRAM_MAX_WIN, hexToBytes, ratio, type PfFloat } from "../provablyFair.js";
import {
  CROSSING_BET_TIERS,
  CROSSING_FLOATS,
  CROSSING_HIT_FLOAT_INDEX,
  CROSSING_MAX_WIN_STARS,
  CROSSING_ROADS,
  CROSSING_ROUNDING_FLOAT_INDEX,
  CROSSING_SURVIVAL_BP,
  crossingDraw,
  crossingGram,
  crossingHitLane,
  crossingLadder,
  crossingLanes,
  crossingOutcome,
  crossingStars,
  type CrossingRoad,
} from "./crossing.js";

const road = (name: string) => name as CrossingRoad;
const floatOf = (uint: number): PfFloat => ({ uint, value: uint / 4294967296 });

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/crossing.cs`. */
describe.each(vectors.cases)("Crossing vectors for nonce $nonce", (c) => {
  it("draws the hit lane on every road", async () => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, CROSSING_FLOATS.stars);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    for (const r of CROSSING_ROADS) expect(crossingDraw(f, r).hitLane).toBe(c.hitLanes[r]);
  });

  it("pays a Stars cash-out at every lane and tier", async () => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, CROSSING_FLOATS.stars);
    for (const r of CROSSING_ROADS) {
      const stars = crossingLadder(r).map((m) => CROSSING_BET_TIERS.map((b) => crossingStars(b, ratio(m), f[CROSSING_ROUNDING_FLOAT_INDEX])));
      expect(stars).toEqual(c.stars[r]);
    }
  });

  it("reads a round: paid before the hit lane, nothing from it on", async () => {
    const f = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, CROSSING_FLOATS.stars);
    for (const r of CROSSING_ROADS) {
      const hitLane = c.hitLanes[r];
      const lanes = crossingLanes(r);
      for (let lane = 1; lane <= lanes; lane++) {
        const o = crossingOutcome(f, r, lane);
        expect(o.hit).toBe(lane >= hitLane);
        expect(o.multiplier).toBe(lane >= hitLane ? "0" : crossingLadder(r)[lane - 1]);
      }
    }
  });
});

describe.each(vectors.roads)("Crossing road $road", (v) => {
  const r = road(v.road);

  it("carries the server's curve and ladder", () => {
    expect(CROSSING_SURVIVAL_BP[r]).toBe(v.survivalBasisPoints);
    expect(crossingLanes(r)).toBe(v.lanes);
    expect(crossingLadder(r)).toEqual(v.ladder);
  });

  it("flips the hit lane at each lane's integer threshold", () => {
    for (const e of v.edges) {
      expect(crossingHitLane(r, floatOf(e.uint32))).toBe(e.hitLane);
      expect(crossingHitLane(r, floatOf(e.belowUint32))).toBe(e.belowHitLane);
    }
  });

  it("sends the ends of the float range to the far side and lane 1", () => {
    expect(crossingHitLane(r, floatOf(0))).toBe(v.zeroHitLane);
    expect(crossingHitLane(r, floatOf(0xffffffff))).toBe(v.maxHitLane);
  });

  it("pays Gram on every lane and tier", () => {
    const gram = crossingLadder(r).map((m) => GRAM_BET_TIERS.map((b) => crossingGram(b, m)));
    expect(gram).toEqual(v.gram);
  });
});

describe("Crossing tables", () => {
  it("carries the server's tiers, caps and float layout", () => {
    expect(CROSSING_BET_TIERS).toEqual(vectors.bets);
    expect(CROSSING_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect([...GRAM_BET_TIERS]).toEqual(vectors.tonTiers);
    expect(GRAM_MAX_WIN).toBe(vectors.maxWinTon);
    expect(CROSSING_FLOATS.stars).toBe(vectors.floatCount);
    expect(CROSSING_HIT_FLOAT_INDEX).toBe(vectors.hitFloatIndex);
    expect(CROSSING_ROUNDING_FLOAT_INDEX).toBe(vectors.roundingFloatIndex);
  });
});
