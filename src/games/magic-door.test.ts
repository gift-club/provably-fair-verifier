import { describe, expect, it } from "vitest";
import vectors from "./magic-door.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, ratio, toGram, toStars } from "../provablyFair.js";
import {
  MAGIC_DOOR_BET_TIERS,
  MAGIC_DOOR_COUNT,
  MAGIC_DOOR_FLOATS,
  MAGIC_DOOR_LEGACY_TABLE,
  MAGIC_DOOR_ROUNDING_FLOAT_INDEX,
  MAGIC_DOOR_TABLE,
  magicDoorOutcome,
  magicDoorTableOf,
} from "./magic-door.js";

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/magic-door.cs`. */
describe.each(vectors.cases)("Magic Door vectors for nonce $nonce", (c) => {
  const floats = (n: number) => generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, n);

  it("shuffles the doors and pays every pick", async () => {
    const f = await floats(MAGIC_DOOR_FLOATS.stars);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    for (let door = 0; door < MAGIC_DOOR_COUNT; door++) {
      const out = magicDoorOutcome(f, door);
      expect(out.doors).toEqual(c.doors);
      expect(out.multiplier).toBe(c.doors[door]);
      expect(MAGIC_DOOR_BET_TIERS.map((b) => toStars(b, ratio(out.multiplier), out.roundingFloat!))).toEqual(c.stars[door]);
    }
  });

  it("replays the 1.4× table, where the rounding float mattered", async () => {
    const f = await floats(MAGIC_DOOR_FLOATS.stars);
    expect(magicDoorTableOf(c.legacyDoors)).toBe(MAGIC_DOOR_LEGACY_TABLE);
    expect(magicDoorTableOf(c.doors)).toBe(MAGIC_DOOR_TABLE);
    for (let door = 0; door < MAGIC_DOOR_COUNT; door++) {
      const out = magicDoorOutcome(f, door, MAGIC_DOOR_LEGACY_TABLE);
      expect(out.doors).toEqual(c.legacyDoors);
      expect(MAGIC_DOOR_BET_TIERS.map((b) => toStars(b, ratio(out.multiplier), out.roundingFloat!))).toEqual(c.starsLegacy[door]);
    }
  });

  it("lays out a pre-rounding round from its four shuffle floats", async () => {
    expect(magicDoorOutcome(await floats(MAGIC_DOOR_FLOATS.legacy), 0).doors).toEqual(c.doors);
  });
});

describe("Magic Door tables", () => {
  it("carries the server's table, tiers and float layout", () => {
    expect(MAGIC_DOOR_TABLE).toEqual(vectors.table);
    expect(MAGIC_DOOR_LEGACY_TABLE).toEqual(vectors.legacyTable);
    expect(MAGIC_DOOR_BET_TIERS).toEqual(vectors.bets);
    expect(MAGIC_DOOR_FLOATS.stars).toBe(vectors.floatsRequired);
    expect(MAGIC_DOOR_ROUNDING_FLOAT_INDEX).toBe(vectors.roundingFloatIndex);
  });

  it("pays Gram on every tier", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
    for (const [m, gram] of Object.entries(vectors.gram.byMultiplier)) expect(GRAM_BET_TIERS.map((b) => toGram(b, ratio(m)))).toEqual(gram);
  });
});
