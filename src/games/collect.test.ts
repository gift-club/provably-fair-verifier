import { describe, expect, it } from "vitest";
import vectors from "./collect.vectors.json";
import { generateBytes, generateFloats, hexToBytes, sha256Hex } from "../provablyFair.js";
import {
  COLLECT_CARD_LAYOUT_FLOATS,
  COLLECT_TICKET_TOTAL,
  COLLECT_WISH_CAP_TICKETS,
  COLLECT_WISH_CAPPED_MAX_TICKETS,
  COLLECT_WISH_LEVELS,
  COLLECT_WISH_MAX_LEVEL,
  canonicalCollectJson,
  collectWishCeiling,
  collectWishFactor,
  deriveWishTable,
  type CollectWishFormula,
  collectChance,
  collectFloatCount,
  collectRowFor,
  collectTableHash,
  parseCollectTable,
} from "./collect.js";

const tableOf = (name: string) => {
  const t = vectors.tables.find((x) => x.name === name);
  if (!t) throw new Error(`no table ${name}`);
  return t;
};

const rowShape = (r: { id: number | null; bucket: string; type: string; stars: number; ton?: number | string | null; from: number; to: number }) => ({
  id: r.id,
  bucket: r.bucket,
  type: r.type,
  stars: r.stars,
  ...(r.ton != null ? { ton: Number(r.ton) } : {}),
  from: r.from,
  to: r.to,
});

/** Every expectation comes from the backend's own code: `scripts/pf-vectors/collect.cs`. */
describe("Collect tables", () => {
  it("carries the server's ticket total and layout size", () => {
    expect(COLLECT_TICKET_TOTAL).toBe(vectors.ticketTotal);
    expect(COLLECT_CARD_LAYOUT_FLOATS).toBe(vectors.layoutFloats);
  });

  describe.each(vectors.tables)("table $name", (t) => {
    it("parses, re-serialises to the server's text and hashes to the server's hash", async () => {
      const parsed = parseCollectTable(t.json);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(canonicalCollectJson(parsed.table)).toBe(t.json);
      expect(await collectTableHash(parsed.table)).toBe(t.hash);
      expect(await sha256Hex(new TextEncoder().encode(t.json))).toBe(t.hash);
    });

    it("hashes the same when pasted pretty-printed", async () => {
      const parsed = parseCollectTable(JSON.stringify(JSON.parse(t.json), null, 2));
      if ("error" in parsed) throw new Error(parsed.error);
      expect(await collectTableHash(parsed.table)).toBe(t.hash);
    });

    it("finds the same row at both ends of every range", () => {
      const parsed = parseCollectTable(t.json);
      if ("error" in parsed) throw new Error(parsed.error);
      for (const b of t.boundaries) {
        expect(collectRowFor(parsed.table, b.ticket), `ticket ${b.ticket}`).toEqual(rowShape(b.row));
      }
      expect(collectRowFor(parsed.table, COLLECT_TICKET_TOTAL)).toBeNull();
      expect(collectRowFor(parsed.table, -1)).toBeNull();
    });

    it("gives every row a chance that sums to 1", () => {
      const parsed = parseCollectTable(t.json);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(parsed.table.rows.reduce((s, r) => s + collectChance(r), 0)).toBeCloseTo(1, 12);
    });
  });
});

describe.each(vectors.cases)("Collect round on $table, nonce $nonce, ticket $ticket", (c) => {
  it("locks the seed, draws the ticket and lands on the server's row", async () => {
    const seed = hexToBytes(c.serverSeed);
    expect(await sha256Hex(seed)).toBe(c.serverSeedHash);
    const bytes = await generateBytes(seed, c.clientSeed, c.nonce, 4 * collectFloatCount("card"));
    expect(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")).toBe(c.hmacHex);

    const floats = await generateFloats(seed, c.clientSeed, c.nonce, collectFloatCount("card"));
    expect(floats[0].uint).toBe(c.ticket);
    floats.slice(1).forEach((f, i) => expect(f.value).toBe(c.layoutFloats[i]));

    const parsed = parseCollectTable(tableOf(c.table).json);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(collectRowFor(parsed.table, floats[0].uint)).toEqual(rowShape(c.row));
  });
});

describe("Collect table refusals", () => {
  const base = tableOf("base").json;
  const edit = (f: (t: { v: number; total: number; rows: { from: number; to: number }[] }) => void) => {
    const t = JSON.parse(base);
    f(t);
    return JSON.stringify(t);
  };

  it("names what is wrong with a pasted table", () => {
    expect(parseCollectTable("  ")).toEqual({ error: "empty" });
    expect(parseCollectTable("{nope")).toEqual({ error: "json" });
    expect(parseCollectTable("[]")).toEqual({ error: "shape" });
    expect(parseCollectTable(edit((t) => { t.v = 2; }))).toEqual({ error: "version" });
    expect(parseCollectTable(edit((t) => { t.total = 100; }))).toEqual({ error: "shape" });
    expect(parseCollectTable(edit((t) => { t.rows[1].from += 1; }))).toEqual({ error: "ranges" });
    expect(parseCollectTable(edit((t) => { t.rows[t.rows.length - 1].to -= 1; }))).toEqual({ error: "ranges" });
  });
});

describe("I want to win", () => {
  it("carries the server's levels and cap", () => {
    expect([...COLLECT_WISH_LEVELS]).toEqual(vectors.wishLevels);
    expect(COLLECT_WISH_CAP_TICKETS).toBe(vectors.wishCapTickets);
    expect(COLLECT_WISH_CAPPED_MAX_TICKETS).toBe(vectors.wishCappedMaxTickets);
    expect(COLLECT_WISH_MAX_LEVEL).toBe(vectors.wishMaxLevel);
  });

  it("puts the ceiling where the server does", () => {
    for (const c of vectors.wishCeilings)
      expect(collectWishCeiling(c.levelMilli, BigInt(c.plainTickets))).toBe(BigInt(c.ceiling));
  });

  describe.each(vectors.wishes)("$table, prize $payoutId at $levelMilli, formula $formula", (w) => {
    it("re-derives the server's boosted table, or refuses where the server does", async () => {
      const parsed = parseCollectTable(tableOf(w.table).json);
      if ("error" in parsed) throw new Error(parsed.error);
      const boosted = deriveWishTable(parsed.table, w.payoutId as number, w.levelMilli, w.stake, w.formula as CollectWishFormula);
      if (w.json == null) {
        expect(boosted).toBeNull();
        return;
      }
      if (!boosted) throw new Error("refused a wish the server offers");
      expect(canonicalCollectJson(boosted)).toBe(w.json);
      expect(await collectTableHash(boosted)).toBe(w.hash);
      expect(collectWishFactor(parsed.table, boosted, w.payoutId as number)).toBe(w.factor);
    });
  });
});
