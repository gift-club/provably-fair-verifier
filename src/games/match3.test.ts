import { describe, expect, it } from "vitest";
import vectors from "./match3.vectors.json";
import { generateFloats, GRAM_BET_TIERS, hexToBytes, toGram } from "../provablyFair.js";
import {
  MATCH3_CURRENT_PAY_TABLE,
  MATCH3_MAX_WIN_GRAM,
  MATCH3_PAY_TABLE_VERSIONS,
  MATCH3_PAY_TABLES,
  MATCH3_STARS_BETS,
  match3Deal,
  match3FloatsFor,
  match3Gift,
  match3BoardSizesFor,
  match3Multiplier,
  match3Outcome,
  match3Replay,
  match3ScoreTier,
  match3StarsPayout,
  type Match3BoardSize,
  type Match3Move,
  type Match3PayTableVersion,
} from "./match3.js";

/**
 * Every expectation below was produced by the backend's own code — see
 * `scripts/pf-vectors/match3.cs`: the deal is `Match3PaidService.DealRound` itself, scores are
 * `Match3Engine.ReplayGame`, payouts `Match3Math` and `TonPayoutCalculator`.
 */
const toMoves = (moves: number[][]): Match3Move[] =>
  moves.map(([fromRow, fromCol, toRow, toCol]) => ({ fromRow, fromCol, toRow, toCol }));

describe("Match-3 tables", () => {
  it("match the server's pay tables, float budgets and Gram cap", () => {
    for (const v of MATCH3_PAY_TABLE_VERSIONS) {
      const t = vectors.tables[String(v) as keyof typeof vectors.tables];
      const mine = MATCH3_PAY_TABLES[v];
      expect(mine.gifts).toEqual(t.gifts);
      expect(mine.scoreBonuses).toEqual(t.scoreBonuses);
      // v4 (the Gift round) has no 5x5 row.
      expect(mine.tierThresholds[5]).toEqual((t.tierThresholds as Record<string, number[]>)["5"]);
      expect(mine.tierThresholds[7]).toEqual(t.tierThresholds["7"]);
      expect(mine.playFactors).toEqual(t.playFactors);
    }
    expect(match3FloatsFor.stars(5)).toBe(vectors.paidFloatBudget["5"]);
    expect(match3FloatsFor.stars(7)).toBe(vectors.paidFloatBudget["7"]);
    expect(match3FloatsFor.gram(5)).toBe(vectors.paidFloatBudget["5"]);
    expect(MATCH3_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    expect([...GRAM_BET_TIERS]).toEqual(vectors.tonTiers);
  });

  it("draws gifts with the server's double maths", () => {
    for (const { roll, gifts } of vectors.giftRolls)
      MATCH3_PAY_TABLE_VERSIONS.forEach((v, i) => expect(match3Gift(v, roll)).toBe(gifts[i]));
  });
});

describe("Match-3 pay table v4 (the Gift round)", () => {
  it("is the current version, 7x7 only, with v3's gifts and factors", () => {
    expect(MATCH3_CURRENT_PAY_TABLE).toBe(4);
    expect(match3BoardSizesFor(4)).toEqual([7]);
    expect(match3BoardSizesFor(3)).toEqual([5, 7]);
    expect(MATCH3_PAY_TABLES[4].tierThresholds).toEqual({ 7: [1300, 1600, 1900] });
    expect(MATCH3_PAY_TABLES[4].gifts).toEqual(MATCH3_PAY_TABLES[3].gifts);
    expect(MATCH3_PAY_TABLES[4].playFactors).toEqual(["0.35", "0.75", "0.95", "1"]);
    expect(MATCH3_PAY_TABLES[4].scoreBonuses).toEqual(["0", "0", "0", "0"]);
    expect(() => match3ScoreTier(4, 5, 2000)).toThrow();
  });

  it("tiers on the 7x7 thresholds", () => {
    const cases: [number, number][] = [[0, 0], [1299, 0], [1300, 1], [1599, 1], [1600, 2], [1899, 2], [1900, 3], [99999, 3]];
    for (const [score, tier] of cases) expect(match3ScoreTier(4, 7, score)).toBe(tier);
  });

  it("pays gift x play factor", () => {
    const factors = [0.35, 0.75, 0.95, 1];
    for (const [gift] of MATCH3_PAY_TABLES[4].gifts)
      factors.forEach((factor, tier) => {
        const r = match3Multiplier(4, gift, tier);
        expect(Number(r.num) / Number(r.den)).toBeCloseTo(Number(gift) * factor, 10);
      });
  });

  it("pays a full gift and the tier pays of the pay table", () => {
    const mean = MATCH3_PAY_TABLES[4].gifts.reduce((a, [m, w]) => a + Number(m) * w, 0) / 1000;
    expect(mean).toBeCloseTo(0.985, 10);
    expect([0.35, 0.75, 0.95, 1].map((f) => +(mean * f * 100).toFixed(3))).toEqual([34.475, 73.875, 93.575, 98.5]);
  });
});

describe.each(vectors.cases)("Match-3 $boardSize x $boardSize nonce $nonce ($why)", (c) => {
  const size = c.boardSize as Match3BoardSize;
  const floats = () => generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, match3FloatsFor.stars(size));

  it("deals the same board, gem sequence, gift and rounding float", async () => {
    const deal = match3Deal(await floats(), size);
    expect(deal.board).toEqual(c.board);
    expect(deal.gemSequence).toEqual(c.gemSequence);
    expect(deal.roundingFloat.value).toBe(c.roundingFloat);
    expect(match3Gift(c.currentPayTableVersion as Match3PayTableVersion, deal.giftFloat.value)).toBe(c.currentGift);
    if (c.why === "reshuffled") expect(deal.reshuffled).toBe(true);
  });

  it("pays every tier of every pay table in Stars and Gram", async () => {
    const f = await floats();
    // v4 is 7x7 only, so a 5x5 case carries no v4 payouts.
    expect(c.payouts.some((p) => p.version === 4)).toBe(size === 7);
    for (const p of c.payouts) {
      const version = p.version as Match3PayTableVersion;
      for (const s of p.scores) {
        const out = match3Outcome(f, { boardSize: size, score: s.score, payTableVersion: version });
        expect(out.gift).toBe(p.gift);
        expect(out.tier).toBe(s.tier);
        expect(out.multiplier).toBe(s.multiplier);
        expect(MATCH3_STARS_BETS.map((b) => match3StarsPayout(b, out))).toEqual(s.stars);
        expect(GRAM_BET_TIERS.map((b) => toGram(b, out.multiplierRatio, MATCH3_MAX_WIN_GRAM))).toEqual(s.gram);
      }
    }
    // A score that did not count settles at tier 0.
    const late = match3Outcome(f, { boardSize: size, score: 99999, scoreCounted: false });
    expect(late.tier).toBe(0);
  });

  it.each(c.replays)("replays the $policy moves to the server's score", (r) => {
    const out = match3Replay(c.board, c.gemSequence, toMoves(r.moves));
    expect(out.totalScore).toBe(r.totalScore);
    expect(out.breakdown).toEqual(r.breakdown);
    expect(out.finalBoard).toEqual(r.finalBoard);
  });
});

describe.each(vectors.specialGames)("Match-3 recorded game $id (combos and prisms)", (g) => {
  it("replays to the server's score and board", () => {
    const out = match3Replay(g.board, g.gemSequence, toMoves(g.moves));
    expect(out.totalScore).toBe(g.totalScore);
    expect(out.breakdown).toEqual(g.breakdown);
    expect(out.finalBoard).toEqual(g.finalBoard);
  });
});
