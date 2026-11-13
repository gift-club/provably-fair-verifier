import { describe, expect, it } from "vitest";
import vectors from "./coin-flip.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, toStars, ratio } from "../provablyFair.js";
import {
  COIN_FLIP_FIRST_RIDE_FLOAT,
  COIN_FLIP_FLIP_FLOAT,
  COIN_FLIP_LADDER,
  COIN_FLIP_MAX_RIDES,
  COIN_FLIP_ROUNDING_FLOAT,
  COIN_FLIP_WIN_MULTIPLIER,
  coinFlipFloatCount,
  coinFlipPaidGram,
  coinFlipPotStars,
  coinFlipRound,
  coinFlipSide,
  parseRideCalls,
} from "./coin-flip.js";

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/coin-flip.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];

describe.each(vectors.cases)("Coin Flip vectors for nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);

  it("draws the flip, the rounding float and one float per ride, and lands each on its side", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, vectors.floatCount);
    f.forEach((x, i) => expect(x.value).toBe(c.floats[i]));
    expect(f.map(coinFlipSide)).toEqual(c.sides);
  });

  it("keeps a round that never rode on the floats it always drew (the stream is prefix-consistent)", async () => {
    const all = await generateFloats(seed, c.clientSeed, c.nonce, vectors.floatCount);
    const stars = await generateFloats(seed, c.clientSeed, c.nonce, coinFlipFloatCount(0, "stars"));
    const gram = await generateFloats(seed, c.clientSeed, c.nonce, coinFlipFloatCount(0, "gram"));
    expect(stars).toEqual(all.slice(0, 2));
    expect(gram).toEqual(all.slice(0, 1));
  });

  it("replays whole rounds call by call", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, vectors.floatCount);
    for (const replay of c.replays) {
      const rideCalls = parseRideCalls(replay.rideCalls);
      expect(rideCalls).toHaveLength(replay.rideCalls.length);
      const out = coinFlipRound(f, replay.call as "heads" | "tails", rideCalls);
      expect(out.first).toBe(replay.first);
      expect(out.rides).toEqual(replay.rides);
      expect(out.step).toBe(replay.step);
      expect(out.lost).toBe(replay.lost);
      expect(out.atTop).toBe(replay.atTop);
      expect(out.multiplier).toBe(replay.multiplier);
    }
  });

  it("doubles the whole first pot per ride, never rounding the doubled amount", async () => {
    const f = await generateFloats(seed, c.clientSeed, c.nonce, vectors.floatCount);
    const rounding = f[COIN_FLIP_ROUNDING_FLOAT];
    BETS.forEach((bet, i) => {
      expect(toStars(bet, ratio(COIN_FLIP_WIN_MULTIPLIER), rounding)).toBe(c.firstPotStars[i]);
      for (let rides = 0; rides <= COIN_FLIP_MAX_RIDES; rides++) {
        expect(coinFlipPotStars(bet, rounding, rides)).toBe(c.potStars[i][rides]);
      }
    });
  });
});

describe("Coin Flip rules", () => {
  it("carries the server's ladder and float layout", () => {
    expect(COIN_FLIP_WIN_MULTIPLIER).toBe(vectors.winMultiplier);
    expect(COIN_FLIP_LADDER).toEqual(vectors.ladder);
    expect(COIN_FLIP_MAX_RIDES).toBe(vectors.maxRides);
    expect(COIN_FLIP_LADDER).toHaveLength(COIN_FLIP_MAX_RIDES + 1);
    expect(COIN_FLIP_FLIP_FLOAT).toBe(vectors.flipFloat);
    expect(COIN_FLIP_ROUNDING_FLOAT).toBe(vectors.roundingFloat);
    expect(COIN_FLIP_FIRST_RIDE_FLOAT).toBe(vectors.firstRideFloat);
    expect(COIN_FLIP_FIRST_RIDE_FLOAT + COIN_FLIP_MAX_RIDES).toBe(vectors.floatCount);
  });

  it("counts the floats a round drew as the verify endpoint returns them", () => {
    expect(coinFlipFloatCount(0, "stars")).toBe(2);
    expect(coinFlipFloatCount(0, "gram")).toBe(1);
    expect(coinFlipFloatCount(1, "stars")).toBe(3);
    expect(coinFlipFloatCount(1, "gram")).toBe(3);
    expect(coinFlipFloatCount(4, "stars")).toBe(vectors.floatCount);
    expect(coinFlipFloatCount(9, "gram")).toBe(vectors.floatCount);
  });

  it("states the biggest Stars win as the top tier's first pot doubled four times", () => {
    expect(vectors.maxWinStars).toBe(100 * 1.9 * 2 ** COIN_FLIP_MAX_RIDES);
    expect(vectors.maxWinStars).toBe(3040);
  });

  it("pays a Gram pot floored to the nanoton, doubled exactly and capped", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
    vectors.gram.paid.forEach((row, t) =>
      row.forEach((paid, rides) => expect(coinFlipPaidGram(GRAM_BET_TIERS[t], rides)).toBe(paid)),
    );
    vectors.gram.paidCapped.forEach((row, t) =>
      row.forEach((paid, rides) => expect(coinFlipPaidGram(GRAM_BET_TIERS[t], rides, "50")).toBe(paid)),
    );
  });

  it("reads ride calls typed as letters", () => {
    expect(parseRideCalls("HTH")).toEqual(["heads", "tails", "heads"]);
    expect(parseRideCalls("h, t t")).toEqual(["heads", "tails", "tails"]);
    expect(parseRideCalls("о р р")).toEqual(["heads", "tails", "tails"]);
    expect(parseRideCalls("")).toEqual([]);
    expect(parseRideCalls("xyz 123")).toEqual([]);
    expect(parseRideCalls("HHHHHHH")).toHaveLength(COIN_FLIP_MAX_RIDES);
  });
});
