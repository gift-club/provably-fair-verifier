import { describe, expect, it } from "vitest";
import vectors from "./crash.vectors.json";
import { generateFloats, hexToBytes, type PfFloat } from "../provablyFair.js";
import {
  CRASH_FLOATS,
  CRASH_MAX_WIN_GRAM,
  CRASH_MAX_WIN_STARS,
  CRASH_SKINS,
  CRASH_TARGET_RTP,
  type CrashSkin,
  centsToMultiplier,
  crashCapCents,
  crashCargoGram,
  crashCargoOutcome,
  crashCargoStars,
  crashGram,
  crashOutcome,
  crashParcels,
  crashParcelsGram,
  crashPointCents,
  crashStars,
} from "./crash.js";

/** Every expectation comes from the backend's own CrashMath: see `scripts/pf-vectors/crash.cs`. */
const BETS = [1, 5, 10, 20, 50, 100];
const latticeFloat = (uint: number): PfFloat => ({ uint, value: uint / 4294967296 });

describe("Crash constants", () => {
  it("match the server's options", () => {
    expect(CRASH_TARGET_RTP).toBe(vectors.targetRtp);
    expect(CRASH_MAX_WIN_STARS).toBe(vectors.maxWinStars);
    expect(CRASH_MAX_WIN_GRAM).toBe(vectors.maxWinTon);
    for (const cap of vectors.caps) {
      const skin = CRASH_SKINS[cap.skin as CrashSkin];
      expect(skin.curveK).toBe(cap.curveK);
      expect(centsToMultiplier(crashCapCents(cap.skin as CrashSkin, 0, "stars"))).toBe(cap.maxMultiplier);
    }
  });

  it("lowers each skin's ceiling by the max win at every Stars bet and Gram tier", () => {
    for (const cap of vectors.caps) {
      const skin = cap.skin as CrashSkin;
      expect(BETS.map((b) => centsToMultiplier(crashCapCents(skin, b, "stars")))).toEqual(cap.stars);
      expect(vectors.tonTiers.map((b) => centsToMultiplier(crashCapCents(skin, b, "gram")))).toEqual(cap.gram);
    }
  });
});

describe("Crash point across the float lattice", () => {
  it.each(vectors.lattice)("u = $uint32 / 2^32", (row) => {
    expect(centsToMultiplier(crashPointCents(latticeFloat(row.uint32)))).toBe(row.rtp95);
    expect(centsToMultiplier(crashPointCents(latticeFloat(row.uint32), "0.97"))).toBe(row.rtp97);
  });
});

describe.each(vectors.cases)("Crash vectors for nonce $nonce", (c) => {
  const seed = hexToBytes(c.serverSeed);

  it("draws the same floats and crash point, Stars and Gram alike", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.stars);
    floats.forEach((f, i) => expect(f.value).toBe(c.floats[i]));
    expect(crashOutcome(floats).crashPoint).toBe(c.crashPoint);
    expect(crashOutcome(floats, { rtp: "0.97" }).crashPoint).toBe(c.crashPoint97);
    const gram = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.gram);
    expect(crashOutcome(gram).crashPoint).toBe(c.crashPoint);
    expect(crashOutcome(gram).roundingFloat).toBeUndefined();
  });

  it("plans every ceiling and auto cash-out the way the server does", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.stars);
    for (const { skin, currency, bet, plan } of c.plans) {
      const cap = centsToMultiplier(crashCapCents(skin as CrashSkin, bet, currency === "Ton" ? "gram" : "stars"));
      expect(cap).toBe(plan.cap);
      const out = crashOutcome(floats, { cap, autoCashout: plan.auto });
      expect(out.end).toBe(plan.end);
      expect(out.endMultiplier).toBe(plan.endMultiplier);
      expect(out.paidMultiplier).toBe(plan.end === "AutoCashout" || plan.end === "MaxReached" ? plan.endMultiplier : null);
    }
  });

  it("judges a hand cash-out as JudgeCashout does", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.stars);
    for (const j of c.judged) {
      const out = crashOutcome(floats, { autoCashout: j.auto, cashout: j.cashout });
      const won = j.result !== "late" && j.result !== "early";
      expect(out.cashoutValid).toBe(won);
      if (won) expect(out.paidMultiplier).toBe(j.result);
    }
  });

  it("pays Stars on float 1 at every bet", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.stars);
    for (const s of c.stars) expect(BETS.map((b) => crashStars(b, s.multiplier, floats[1]))).toEqual(s.payouts);
  });

  it("replays a Moon Post drop and eject the way the server judges and pays them", async () => {
    const floats = await generateFloats(seed, c.clientSeed, c.nonce, CRASH_FLOATS.cargoStars);
    c.cargoFloats.forEach((f, i) => expect(floats[i].value).toBe(f));
    for (const v of c.cargo) {
      const o = crashCargoOutcome(floats, { autoCashout: v.auto, autoDrop: v.autoDrop, drop: v.drop, cashout: v.eject });
      const at = `auto ${v.auto} autoDrop ${v.autoDrop} drop ${v.drop} eject ${v.eject}`;
      expect(o.dropMultiplier, at).toBe(v.dropMultiplier);
      expect(o.dropAuto, at).toBe(v.dropAuto);
      expect(o.paidMultiplier, at).toBe(v.restMultiplier);
      expect(o.dropValid, at).toBe(v.drop ? v.dropVerdict === "Hand" : null);
      const stars = [5, 7, 100].map((b) => crashCargoStars(b, o)).map((p) => [p!.drop, p!.rest]);
      expect(stars, at).toEqual(v.stars);
      const gram = ["0.1", "0.5", "10"].map((b) => crashCargoGram(b, o)).map((p) => [p.drop, p.rest]);
      expect(gram, at).toEqual(v.gram);
    }
  });
});

describe("Moon Post parcels", () => {
  it("split a stake as CrashMath.Parcels and ParcelsTon do", () => {
    for (const p of vectors.parcels.stars) {
      const { first, second } = crashParcels(p.bet);
      expect([first, second]).toEqual(p.parcels);
    }
    for (const p of vectors.parcels.gram) {
      const { first, second } = crashParcelsGram(p.bet);
      expect([first, second]).toEqual(p.parcels);
    }
  });

  it("never take a drop under 1.01x, or one past an auto-drop the plane reached", async () => {
    const c = vectors.cases.find((x) => x.nonce === 7)!; // crash point 9.72
    const floats = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, CRASH_FLOATS.cargoStars);
    expect(crashCargoOutcome(floats, { drop: "1.00" }).dropValid).toBe(false);
    const past = crashCargoOutcome(floats, { autoDrop: "1.50", drop: "3.00" });
    expect(past.dropValid).toBe(false);
    expect(past.dropMultiplier).toBe("1.50");
    expect(past.dropAuto).toBe(true);
  });

  it("needs float 2 to price a Stars drop", async () => {
    const c = vectors.cases.find((x) => x.nonce === 7)!;
    const two = await generateFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce, CRASH_FLOATS.stars);
    expect(crashCargoStars(5, crashCargoOutcome(two, { drop: "2.00" }))).toBeNull();
    expect(crashCargoStars(5, crashCargoOutcome(two, { cashout: "2.00" }))?.total).toBe(10);
  });
});

describe("Crash Gram payouts", () => {
  it.each(vectors.gram)("at $multiplier", (g) => {
    expect(vectors.tonTiers.map((b) => crashGram(b, g.multiplier))).toEqual(g.payouts);
  });
});
