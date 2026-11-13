import { describe, expect, it } from "vitest";
import vectors from "./pachinko.vectors.json";
import { generateFloats, hexToBytes } from "../provablyFair.js";
import {
  PACHINKO_CURRENT_PAY_TABLE,
  PACHINKO_FLOATS,
  PACHINKO_FLOATS_BY_VERSION,
  PACHINKO_MAX_WIN_GRAM,
  PACHINKO_MAX_WIN_STARS,
  PACHINKO_PAY_TABLES,
  PACHINKO_PAY_TABLE_VERSIONS,
  type PachinkoPayTableVersion,
  pachinkoGram,
  pachinkoOutcome,
  pachinkoSpinMultiplier,
  pachinkoStars,
} from "./pachinko.js";

/** Every expectation comes from the backend's own code: see `scripts/pf-vectors/pachinko.cs`. */
const unpack = (p: number): [number, number, number] => [p % 8, Math.floor(p / 8) % 8, Math.floor(p / 64) % 8];

describe("Pachinko constants", () => {
  it("match the server", () => {
    expect(PACHINKO_FLOATS.stars).toBe(vectors.floatsPerRound);
    expect(PACHINKO_FLOATS.gram).toBe(vectors.floatsPerRound);
    expect(PACHINKO_FLOATS_BY_VERSION).toEqual(vectors.floatsByVersion);
    expect(PACHINKO_CURRENT_PAY_TABLE).toBe(vectors.currentVersion);
    expect(PACHINKO_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(PACHINKO_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    for (const t of vectors.tables) {
      const mine = PACHINKO_PAY_TABLES[t.version as PachinkoPayTableVersion];
      expect(String(mine.pocket)).toBe(t.pocket);
      expect(String(mine.baseConsolation)).toBe(t.baseConsolation);
      expect(String(mine.feverConsolation)).toBe(t.feverConsolation);
      expect(mine.basePairs.map(String)).toEqual(t.basePairs);
      expect(mine.baseTriples.map(String)).toEqual(t.baseTriples);
      expect(mine.feverPairs.map(String)).toEqual(t.feverPairs);
      expect(mine.feverTriples.map(String)).toEqual(t.feverTriples);
      expect(
        mine.rush ? { ...mine.rush, cap: String(mine.rush.cap) } : null,
      ).toEqual(t.rush);
    }
  });

  it.each(vectors.spins)("prices all 512 reel triples on version $version", (s) => {
    const table = PACHINKO_PAY_TABLES[s.version as PachinkoPayTableVersion];
    for (let p = 0; p < 512; p++) {
      expect(String(pachinkoSpinMultiplier(unpack(p), false, table))).toBe(s.normal[p]);
      expect(String(pachinkoSpinMultiplier(unpack(p), true, table))).toBe(s.fever[p]);
    }
  });

  it("caps Gram at 1000 on the v2 ceiling", () => {
    expect(vectors.tonTiers.map((b) => pachinkoGram(b, 1650))).toEqual(vectors.gramCap);
  });
});

describe.each(vectors.cases)("Pachinko vectors for $clientSeed nonce $nonce", (c) => {
  it("resolves the round on every pay-table version and pays it", async () => {
    const floats = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, PACHINKO_FLOATS.stars);
    floats.forEach((f, i) => expect(f.value).toBe(c.floats[i]));

    for (const version of PACHINKO_PAY_TABLE_VERSIONS) {
      const want = c.versions[String(version) as "1" | "2" | "3" | "4"];
      const out = pachinkoOutcome(floats, version);
      const [ball] = want.balls;
      expect(out.ball.packedPath).toBe(ball.packedPath);
      expect(out.ball.packedReels).toBe(ball.packedReels);
      expect(out.ball.kind).toBe(ball.kind);
      expect(String(out.ball.multiplier)).toBe(ball.multiplier);
      expect(
        out.fever?.map((b) => ({
          entryLane: b.lane,
          packedReels: b.packedReels,
          kind: b.kind,
          multiplier: String(b.multiplier),
          // The fever tables' descriptors carry neither, and the backend writes null.
          mode: b.mode ?? null,
          ballsLeft: b.ballsLeft ?? null,
        })) ?? null,
      ).toEqual(want.fever.length ? want.fever[0].balls : null);
      expect(out.entry ?? null).toBe(want.fever[0]?.entry ?? null);
      expect(out.capped ?? null).toBe(want.fever[0]?.capped ?? null);
      expect(String(out.multiplier)).toBe(want.multiplier);
      expect(out.outcome).toBe(want.outcome);
      expect(vectors.bets.map((b) => pachinkoStars(b, out.multiplier, version))).toEqual(want.stars);
      expect(vectors.tonTiers.map((b) => pachinkoGram(b, out.multiplier))).toEqual(want.gram);
    }
  });
});
