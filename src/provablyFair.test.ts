import { describe, expect, it } from "vitest";
import vectors from "./provablyFair.vectors.json";
import {
  BALLOON_CURVES,
  balloonBurstPump,
  balloonLadder,
  balloonPumpOutcome,
  bytesToHex,
  EXAMPLE_ROUND,
  coinFlipOutcome,
  diceDuelOutcome,
  generateBytes,
  formatNano,
  generateFloats,
  GRAM_BET_TIERS,
  gramFloatsFor,
  hexToBytes,
  isGramCapped,
  higherLowerCallMultiplier,
  higherLowerDeck,
  higherLowerReplay,
  HIGHER_LOWER_MULTIPLIERS,
  kenoOutcome,
  minefieldOutcome,
  minesTowerOutcome,
  PLINKO_PAY_TABLE_VERSIONS,
  PLINKO_TABLES,
  plinkoOutcome,
  ratio,
  rollOverOutcome,
  SEA_WAR,
  seaWarDeal,
  seaWarLayoutNonce,
  sha256Hex,
  toGram,
  toNano,
  toStars,
} from "./provablyFair.js";

/**
 * Every expectation below was produced by the backend's own code — see
 * the server's own vector generator. A failure here means the public checker would
 * tell a player that a genuine round does not verify.
 */
const BETS = [1, 5, 10, 20, 50, 100];
/** The PvP Sea Battle stakes: no ★1 duel. */
const DUEL_BETS = [5, 10, 20, 50, 100];

describe.each(vectors.cases)("provably fair vectors for nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);
  const floats = (n: number) => generateFloats(seed, c.clientSeed, c.nonce, n);

  it("hashes the server seed and derives the same bytes and floats", async () => {
    expect(await sha256Hex(seed)).toBe(c.serverSeedHash);
    expect(bytesToHex(await generateBytes(seed, c.clientSeed, c.nonce, 44))).toBe(c.hmacHex44.toLowerCase());
    const f = await floats(11);
    f.forEach((x, i) => expect(x.value).toBe(c.floats11[i]));
  });

  // The vectors were generated under pay-table version 1, which is why this case fixes
  // only the path and the landing slot: those come from the floats alone and no retune
  // has moved them. Which multiplier a slot pays is version-specific, and is pinned
  // against the tables themselves in `plinkoMath.test.ts`.
  it("reproduces a sixteen-row Plinko drop on either pay-table version", async () => {
    const f = await floats(17);
    for (const version of PLINKO_PAY_TABLE_VERSIONS) {
      const out = plinkoOutcome(f, 16, "high", version);
      expect(out.slot).toBe(c.plinko16.slot);
      const bits = out.path.reduce((acc, step, i) => (step === "R" ? acc | (1 << i) : acc), 0);
      expect(bits).toBe(c.plinko16.bits);
      expect(out.multiplier).toBe(PLINKO_TABLES[version][16].high[c.plinko16.slot]);
    }
  });

  it("reproduces the Keno draw and its payout rounding", async () => {
    const out = kenoOutcome(await floats(11), [1, 2, 3, 4, 5]);
    expect(out.drawn).toEqual(c.keno);
    expect(BETS.map((b) => toStars(b, ratio("1.09"), out.roundingFloat))).toEqual(c.stars.keno5x109);
  });

  it("draws a Gram Keno round from its ten floats, the same tiles as the Stars round", async () => {
    const out = kenoOutcome(await floats(gramFloatsFor.keno()), [1, 2, 3, 4, 5]);
    expect(out.drawn).toEqual(c.kenoGram);
    expect(c.kenoGram).toEqual(c.keno);
  });

  it("reproduces the Roll Over roll and a threshold-47 payout", async () => {
    const out = rollOverOutcome(await floats(2), 47);
    expect(out.roll).toBe(c.rollOver);
    expect(BETS.map((b) => toStars(b, out.multiplier, out.roundingFloat))).toEqual(c.stars.rollOver47);
  });

  it("reproduces Dice Duel's four dice and a 1.78× payout", async () => {
    const out = diceDuelOutcome(await floats(5));
    expect([...out.you, ...out.house]).toEqual(c.diceDuel);
    expect(BETS.map((b) => toStars(b, ratio("1.78"), out.roundingFloat))).toEqual(c.stars.diceDuel178);
  });

  it("reproduces the Coin Flip side and its payout", async () => {
    const out = coinFlipOutcome(await floats(2));
    expect(out.side).toBe(c.coinFlip);
    expect(BETS.map((b) => toStars(b, ratio(out.multiplier), out.roundingFloat))).toEqual(c.stars.coinFlip);
  });

  it("places Minefield mines exactly as the server does", async () => {
    for (const [difficulty, mines] of Object.entries(c.minefield)) {
      const d = difficulty as "easy" | "medium" | "hard";
      const out = minefieldOutcome(await floats(mines.length + 1), d);
      expect(out.mines).toEqual(mines);
    }
  });

  it("places Mines Tower mines level by level exactly as the server does", async () => {
    for (const [difficulty, levels] of Object.entries(c.minesTower)) {
      const d = difficulty as "easy" | "medium" | "hard";
      const count = levels.length * levels[0].length;
      const out = minesTowerOutcome(await floats(count + 1), d);
      expect(out.levels).toEqual(levels);
    }
  });

  it("derives the Balloon Pump burst pump", async () => {
    expect(balloonPumpOutcome(await floats(2)).burstPump).toBe(c.balloonBurstPump);
    expect(balloonPumpOutcome(await floats(2), BALLOON_CURVES.flat).burstPump).toBe(c.balloonBurstPumpFlat);
  });

  it("shuffles the Higher/Lower deck and reads the separate payout stream", async () => {
    expect(higherLowerDeck(await floats(51))).toEqual(c.higherLowerDeck);
    const payout = await generateFloats(seed, `${c.clientSeed}:payout`, c.nonce, 6);
    payout.forEach((x, i) => expect(x.value).toBe(c.higherLowerPayoutFloats[i]));
    expect(BETS.map((b) => toStars(b, ratio(HIGHER_LOWER_MULTIPLIERS[2]), payout[2]))).toEqual(c.stars.higherLowerRound3);
  });

  it("replays per-call Higher/Lower rounds call by call, and pays them", async () => {
    const deck = higherLowerDeck(await floats(51));
    const payout = await generateFloats(seed, `${c.clientSeed}:payout`, c.nonce, 52);
    for (const round of Object.values(c.higherLowerPerCall)) {
      const replay = higherLowerReplay(deck, round.calls);
      expect(replay.refusedAt).toBeUndefined();
      expect(replay.steps).toEqual(round.steps);
      expect(replay.rounds).toBe(round.rounds);
      expect(replay.lost).toBe(round.lost);
      expect(replay.multiplier).toBe(round.multiplier);
      const banked = !replay.lost && replay.rounds > 0;
      expect(BETS.map((b) => (banked ? toStars(b, ratio(replay.multiplier), payout[replay.rounds - 1]) : 0))).toEqual(round.stars);
      expect(GRAM_BET_TIERS.map((b) => (banked ? toGram(b, ratio(replay.multiplier)) : "0"))).toEqual(round.gram);
    }
  });

  it("deals both Sea Battle fleets at every reachable layout, the first mover and the payout", async () => {
    expect(c.seaWar.layouts.map((l) => l.k)).toContain(SEA_WAR.maxShuffles);
    for (const layout of c.seaWar.layouts) {
      const k = layout.k;
      const out = await seaWarDeal(seed, c.clientSeed, c.nonce, k);
      expect(out.creator).toEqual(layout.creator);
      expect(out.opponent).toEqual(layout.opponent);
      expect(out.creatorShootsFirst).toBe(c.seaWar.creatorShootsFirst);
      expect(DUEL_BETS.map((b) => toStars(b, ratio(SEA_WAR.winMultiplier), out.roundingFloat))).toEqual(c.seaWar.stars);
    }
  });
});

describe("provably fair helpers", () => {
  it("gives each Sea Battle layout its own nonce past the reserved base nonce", () => {
    expect(seaWarLayoutNonce(7, "creator", 0)).toBe(8);
    expect(seaWarLayoutNonce(7, "opponent", 0)).toBe(9);
    expect(seaWarLayoutNonce(7, "creator", 1)).toBe(10);
    expect(seaWarLayoutNonce(7, "opponent", 5)).toBe(19);
  });

  it("opens the checker on a real vector case", () => {
    const { serverSeed, serverSeedHash, clientSeed, nonce } = vectors.cases[0];
    expect(EXAMPLE_ROUND).toEqual({ serverSeed, serverSeedHash, clientSeed, nonce });
  });

  it("rebuilds the Balloon Pump ladder to four decimals, under the sliding and the flat curve", () => {
    expect(balloonLadder()).toEqual(vectors.balloonLadder);
    expect(balloonLadder(BALLOON_CURVES.flat)).toEqual(vectors.balloonLadderFlat);
  });

  it("walks the Balloon Pump burst pump across the whole range of rolls, under both curves", () => {
    for (const r of vectors.balloonRolls) {
      expect(balloonBurstPump(r.roll)).toBe(r.sliding);
      expect(balloonBurstPump(r.roll, BALLOON_CURVES.flat)).toBe(r.flat);
    }
  });

  it("prices a Higher/Lower call exactly as HigherLowerMath.CallMultiplier does, first and later", () => {
    const text = (m: number | null) => (m === null ? null : (m / 10_000).toString());
    for (const p of vectors.higherLowerPrices) {
      expect(text(higherLowerCallMultiplier(p.winners, p.losers, true))).toBe(p.first);
      expect(text(higherLowerCallMultiplier(p.winners, p.losers, false))).toBe(p.later);
    }
  });

  it("checks the Gram tiers the backend vectors were built on", () => {
    expect([...GRAM_BET_TIERS]).toEqual(vectors.gram.tiers);
  });

  it("pays Gram as the server does: floored to the nanoton, capped at 1000 GRAM", () => {
    const g = vectors.gram;
    const pay = (m: Parameters<typeof toGram>[1]) => GRAM_BET_TIERS.map((b) => toGram(b, m));
    expect(pay(ratio("1.09"))).toEqual(g.keno5x109);
    expect(pay({ num: 95n, den: 52n })).toEqual(g.rollOver47);
    expect(pay(ratio("1.78"))).toEqual(g.diceDuel178);
    expect(pay(ratio("1.90"))).toEqual(g.coinFlip);
    expect(pay(ratio(HIGHER_LOWER_MULTIPLIERS[5]))).toEqual(g.higherLowerRound6);
    expect(pay(ratio(balloonLadder()[34]))).toEqual(g.balloonPump35);
    expect(pay(ratio("107.4"))).toEqual(g.plinko1074);
  });

  it("knows when the cap, not the multiplier, set a Gram payout", () => {
    expect(isGramCapped("10", ratio("107.4"))).toBe(true);
    expect(isGramCapped("10", ratio("100"))).toBe(false);
    expect(isGramCapped("5", ratio("107.4"))).toBe(false);
  });

  it("converts Gram amounts to nanotons and back without losing a digit", () => {
    expect(toNano("0.1")).toBe(100_000_000n);
    expect(toNano("1000")).toBe(1_000_000_000_000n);
    expect(formatNano(182_692_307n)).toBe("0.182692307");
    expect(formatNano(1_900_000_000n)).toBe("1.9");
    expect(formatNano(0n)).toBe("0");
  });

  it("draws no rounding float for a Gram round, except Roll Over's unused second float", () => {
    expect(gramFloatsFor.plinko(16)).toBe(16);
    expect(gramFloatsFor.keno()).toBe(10);
    expect(gramFloatsFor.rollOver()).toBe(2);
    expect(gramFloatsFor.diceDuel()).toBe(4);
    expect(gramFloatsFor.coinFlip()).toBe(1);
    expect(gramFloatsFor.minefield("medium")).toBe(5);
    expect(gramFloatsFor.minesTower("hard")).toBe(15);
    expect(gramFloatsFor.balloonPump()).toBe(1);
  });

  it("never rounds a whole payout", () => {
    expect(toStars(5, ratio("1.0"), { value: 0, uint: 0 })).toBe(5);
    expect(toStars(5, ratio("0.2"), { value: 0.99, uint: 4294967295 })).toBe(1);
  });

  it("rounds up only when the float is strictly below the fraction", () => {
    // 5 × 1.09 = 5.45 → 6 when float < 0.45, otherwise 5.
    const justBelow = Math.floor(0.45 * 2 ** 32);
    expect(toStars(5, ratio("1.09"), { value: justBelow / 2 ** 32, uint: justBelow })).toBe(6);
    const exactly = { value: 0.45, uint: Math.ceil(0.45 * 2 ** 32) };
    expect(toStars(5, ratio("1.09"), exactly)).toBe(5);
  });
});
