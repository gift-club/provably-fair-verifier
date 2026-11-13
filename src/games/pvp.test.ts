import { describe, expect, it } from "vitest";
import { generateFloats, hexToBytes, type PfFloat, SEA_WAR, seaWarDeal } from "../provablyFair.js";
import { PVP_DAMA, PVP_DAMA_STAR_STAKES, pvpDamaBase } from "./pvp-dama.js";
import { PVP_BALLOON_CURVE, PVP_BALLOON_PUMP, pvpBalloonBurstPump, pvpBalloonPumpOutcome } from "./pvp-balloon-pump.js";
import { PVP_DICE_DUEL, pvpDiceDuelMatch, pvpDiceDuelRoundingFloat, pvpDiceDuelRounds } from "./pvp-dice-duel.js";
import { PVP_LUDO, pvpLudoBase, pvpLudoRolls } from "./pvp-ludo.js";
import { PVP_MINEFIELD, pvpMinefieldOutcome } from "./pvp-minefield.js";
import { PVP_HOUSE_EDGE, PVP_STAR_STAKES, PVP_WIN_MULTIPLIER, pvpGramPayout, pvpStarsPayout } from "./pvp-pot.js";
import { PVP_SEA_BATTLE_BASE, seaWarFleetCommitment, seaWarLayouts } from "./pvp-sea-battle.js";
import vectors from "./pvp.vectors.json";

/**
 * Pins the PvP ports to vectors the backend's own code produced
 * (`scripts/pf-vectors/pvp.cs`). A failure here means the server's draw changed: regenerate the
 * vectors and update the port in the same change.
 */

const stars = (f: PfFloat) => PVP_STAR_STAKES.map((b) => pvpStarsPayout(b, f));

describe("PvP constants match the backend", () => {
  const k = vectors.constants;
  it("pot", () => {
    expect(k.houseEdge).toEqual([0.05, 0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(Number(PVP_HOUSE_EDGE)).toBe(0.05);
    expect(Number(PVP_WIN_MULTIPLIER)).toBe(2 * (1 - 0.05));
    expect([...PVP_STAR_STAKES]).toEqual(vectors.stakes);
    expect(vectors.gram.tiers.map(pvpGramPayout)).toEqual(vectors.gram.win);
  });
  it("games", () => {
    expect(k.diceDuel).toEqual({ FloatsPerRound: PVP_DICE_DUEL.floatsPerRound, RoundsToWin: PVP_DICE_DUEL.roundsToWin });
    expect(k.balloonPump).toEqual({
      floatsPerMatch: PVP_BALLOON_PUMP.floatsPerMatch,
      burst: PVP_BALLOON_PUMP.burstFloatIndex,
      firstTurn: PVP_BALLOON_PUMP.firstTurnFloatIndex,
      rounding: PVP_BALLOON_PUMP.roundingFloatIndex,
      SurvivalRate: PVP_BALLOON_PUMP.survivalPct / 100,
      MaxPumps: PVP_BALLOON_PUMP.maxPumps,
      MaxPumpsPerTurn: PVP_BALLOON_PUMP.maxPumpsPerTurn,
    });
    expect(k.minefield).toEqual({ gridSize: PVP_MINEFIELD.gridSize, mineCount: PVP_MINEFIELD.mineCount });
    expect(PVP_MINEFIELD.floatCount).toBe(k.minefield.mineCount + 2);
    expect(k.ludo).toEqual({
      baseFloatCount: PVP_LUDO.baseFloatCount,
      firstMover: PVP_LUDO.firstMoverFloatIndex,
      rounding: PVP_LUDO.roundingFloatIndex,
      capTiebreak: PVP_LUDO.capTiebreakFloatIndex,
      RingSize: PVP_LUDO.ringSize,
      HomeColumnLength: PVP_LUDO.homeColumnLength,
      TokensPerPlayer: PVP_LUDO.tokensPerPlayer,
      TokensToWin: PVP_LUDO.tokensToWin,
      MaxRollsPerTurn: PVP_LUDO.maxRollsPerTurn,
      MaxTurns: PVP_LUDO.maxTurns,
    });
    expect(k.seaWar).toEqual({
      baseFloatCount: PVP_SEA_BATTLE_BASE.baseFloatCount,
      firstMover: PVP_SEA_BATTLE_BASE.firstMoverFloatIndex,
      rounding: PVP_SEA_BATTLE_BASE.roundingFloatIndex,
      BoardSize: SEA_WAR.boardSize,
      Fleet: [...SEA_WAR.fleet],
      MaxShuffles: SEA_WAR.maxShuffles,
      DealAttempts: SEA_WAR.dealAttempts,
    });
    expect(k.dama).toEqual({
      baseFloatCount: PVP_DAMA.baseFloatCount,
      firstMover: PVP_DAMA.firstMoverFloatIndex,
      rounding: PVP_DAMA.roundingFloatIndex,
      BetTiers: [...PVP_DAMA_STAR_STAKES],
    });
  });
});

describe("PvP Balloon Pump burst pump across the roll range", () => {
  it("matches DeriveBurstPump(roll, 0.90, 50)", () => {
    expect(PVP_BALLOON_CURVE.maxPumps).toBe(50);
    for (const { roll, burstPump } of vectors.balloonRolls) expect(pvpBalloonBurstPump(roll)).toBe(burstPump);
  });
});

describe.each(vectors.cases)("PvP vectors for client seed $clientSeed, nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);

  it("Dice Duel", async () => {
    const rounds = await pvpDiceDuelRounds(seed, c.clientSeed, c.nonce, c.diceDuel.rounds.length);
    expect(rounds).toEqual(c.diceDuel.rounds);
    const match = await pvpDiceDuelMatch(seed, c.clientSeed, c.nonce);
    expect(match.rounds).toHaveLength(c.diceDuel.match.roundsPlayed);
    expect(match.creatorWins).toBe(c.diceDuel.match.creatorWins);
    expect(match.opponentWins).toBe(c.diceDuel.match.opponentWins);
    expect(match.winner).toBe(c.diceDuel.match.winner);
    const rounding = await pvpDiceDuelRoundingFloat(seed, c.clientSeed, c.nonce);
    expect(rounding.value).toBe(c.diceDuel.roundingFloat);
    expect(match.roundingFloat).toEqual(rounding);
    expect(stars(rounding)).toEqual(c.diceDuel.stars);
  });

  it("Balloon Pump", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, PVP_BALLOON_PUMP.floatsPerMatch);
    floats.forEach((f, i) => expect(f.value).toBe(c.balloonPump.floats[i]));
    const out = pvpBalloonPumpOutcome(floats);
    expect(out.burstPump).toBe(c.balloonPump.burstPump);
    expect(out.deflates).toBe(c.balloonPump.burstPump > PVP_BALLOON_PUMP.maxPumps);
    expect(out.creatorPumpsFirst).toBe(c.balloonPump.creatorGoesFirst);
    expect(out.roundingFloat.value).toBe(c.balloonPump.roundingFloat);
    expect(stars(out.roundingFloat)).toEqual(c.balloonPump.stars);
  });

  it("Minefield", async () => {
    const out = pvpMinefieldOutcome(await generateFloats(seed, c.clientSeed, c.nonce, PVP_MINEFIELD.floatCount));
    expect(out.mines).toEqual(c.minefield.mines);
    expect(out.creatorPicksFirst).toBe(c.minefield.creatorGoesFirst);
    expect(out.firstMoverFloat.value).toBe(c.minefield.firstMoverFloat);
    expect(out.roundingFloat.value).toBe(c.minefield.roundingFloat);
    expect(stars(out.roundingFloat)).toEqual(c.minefield.stars);
  });

  it("Ludo", async () => {
    const base = await generateFloats(seed, c.clientSeed, c.nonce, PVP_LUDO.baseFloatCount);
    base.forEach((f, i) => expect(f.value).toBe(c.ludo.baseFloats[i]));
    const out = pvpLudoBase(base);
    expect(out.creatorMovesFirst).toBe(c.ludo.creatorGoesFirst);
    expect(out.capTiebreakCreatorWins).toBe(c.ludo.capTiebreakCreatorWins);
    expect(out.roundingFloat.value).toBe(c.ludo.roundingFloat);
    expect(stars(out.roundingFloat)).toEqual(c.ludo.stars);
    expect(await pvpLudoRolls(seed, c.clientSeed, c.nonce, "creator", c.ludo.creatorRolls.length)).toEqual(c.ludo.creatorRolls);
    expect(await pvpLudoRolls(seed, c.clientSeed, c.nonce, "opponent", c.ludo.opponentRolls.length)).toEqual(c.ludo.opponentRolls);
  });

  it("Sea Battle", async () => {
    const deal = await seaWarDeal(seed, c.clientSeed, c.nonce, 0);
    expect(deal.firstMoverFloat.value).toBe(c.seaWar.baseFloats[PVP_SEA_BATTLE_BASE.firstMoverFloatIndex]);
    expect(deal.roundingFloat.value).toBe(c.seaWar.roundingFloat);
    expect(deal.creatorShootsFirst).toBe(c.seaWar.creatorShootsFirst);
    expect(stars(deal.roundingFloat)).toEqual(c.seaWar.stars);
    const creator = await seaWarLayouts(seed, c.clientSeed, c.nonce, "creator");
    const opponent = await seaWarLayouts(seed, c.clientSeed, c.nonce, "opponent");
    expect(creator).toHaveLength(SEA_WAR.maxShuffles + 1);
    expect(opponent).toHaveLength(SEA_WAR.maxShuffles + 1);
    expect(c.seaWar.layoutNonces.map((n) => n.k)).toContain(SEA_WAR.maxShuffles);
    for (const n of c.seaWar.layoutNonces) {
      expect(creator[n.k].nonce).toBe(n.creator);
      expect(opponent[n.k].nonce).toBe(n.opponent);
    }
    const cellsOf = (ships: { cells: number[] }[]) => ships.flatMap((s) => s.cells).sort((a, b) => a - b);
    expect(cellsOf(creator[0].ships)).toEqual(c.seaWar.commitments.creatorLayout0.cells);
    expect(cellsOf(opponent[3].ships)).toEqual(c.seaWar.commitments.opponentLayout3.cells);
    expect(await seaWarFleetCommitment(seed, "creator", creator[0].ships.flatMap((s) => s.cells))).toBe(
      c.seaWar.commitments.creatorLayout0.value,
    );
    expect(await seaWarFleetCommitment(seed, "opponent", c.seaWar.commitments.opponentLayout3.cells)).toBe(
      c.seaWar.commitments.opponentLayout3.value,
    );
  });

  it("Dama and Checkers", async () => {
    const base = await generateFloats(seed, c.clientSeed, c.nonce, PVP_DAMA.baseFloatCount);
    base.forEach((f, i) => expect(f.value).toBe(c.dama.baseFloats[i]));
    const out = pvpDamaBase(base);
    expect(out.creatorPlaysWhite).toBe(c.dama.creatorPlaysWhite);
    expect(out.roundingFloat.value).toBe(c.dama.roundingFloat);
    expect(PVP_DAMA_STAR_STAKES.map((b) => pvpStarsPayout(b, out.roundingFloat))).toEqual(c.dama.stars);
  });
});
