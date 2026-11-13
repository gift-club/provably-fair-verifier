/**
 * Boxes and scratch cards for the provably fair checker, mirroring the backend byte for byte.
 * Sources, read 2026-10-15:
 * - `CollectFairEngine.DrawAsync`: one Collect seed pair per player for every box and card, one nonce
 *   per open. The round reads `ProvablyFairEngine.GenerateBytes(serverSeed, clientSeed, nonce, …)`;
 *   bytes 0-3 as a big-endian uint32 are the ticket (`CollectTable.TicketFrom`), in [0, 2^32). It is
 *   float 0 of the stream, as an integer (`PfFloat.uint`). The floats after it are layout: a scratch
 *   card reads 19 (`CollectFairService.ScratchCardLayoutFloats`: 15 for the grid, 4 for NFT art), a
 *   box reads none.
 * - `CollectTable` / `CollectTicketTable`: the round's prize table is a list of rows in the order Loss,
 *   Even, Win, Big, each owning the half-open ticket range [from, to). The text the round stores is
 *   canonical (`{"v":1,"total":4294967296,"rows":[{"id":1,"bucket":"Loss","type":"Stars","stars":3,
 *   "from":0,"to":2147483648},…]}`, an optional `ton` after `stars` on a Gram row, `id` null on the
 *   stand-in row of an empty bucket), and its SHA-256 over the UTF-8 text is the table hash the app
 *   shows. Live modifiers (a Big prize hour, a high-end boost, rows left out for the player) change the
 *   table, so every round carries its own; the base table's hash is stored beside it.
 * - Nothing about the player's earlier opens enters the table. Odds are fixed per product.
 * Pinned by `collect.test.ts` against `scripts/pf-vectors/collect.cs`, which builds its tables with
 * `CollectTicketTable.Build`. The scratch card's grid (`ScratchCardService.GenerateGrid`) also needs the
 * card's icons and decoy list, which a pasted table does not carry, so the checker shows the layout
 * floats and leaves the grid itself out.
 */
import { sha256Hex } from "../provablyFair.js";

/** CollectTable.TicketTotal: tickets are 0 up to this, exclusive. */
export const COLLECT_TICKET_TOTAL = 4294967296;

/** CollectFairService.ScratchCardLayoutFloats: a card's grid (15) and NFT art (4), read after the ticket. */
export const COLLECT_CARD_LAYOUT_FLOATS = 19;

/** A box reads no layout floats. */
export const COLLECT_BOX_LAYOUT_FLOATS = 0;

/** The floats a round reads: the ticket's own, then its layout floats. */
export const collectFloatCount = (kind: CollectKind) =>
  1 + (kind === "card" ? COLLECT_CARD_LAYOUT_FLOATS : COLLECT_BOX_LAYOUT_FLOATS);

export type CollectKind = "box" | "card";

export const COLLECT_BUCKETS = ["Loss", "Even", "Win", "Big"] as const;
export type CollectBucket = (typeof COLLECT_BUCKETS)[number];

export interface CollectRow {
  id: number | null;
  bucket: CollectBucket;
  type: string;
  stars: number;
  /** Present on a Gram prize row. */
  ton?: number;
  from: number;
  to: number;
}

export interface CollectTable {
  v: 1;
  total: number;
  rows: CollectRow[];
}

export type CollectTableError =
  | "empty" // nothing pasted
  | "json" // not JSON
  | "shape" // not the table's fields
  | "version" // v is not 1
  | "ranges"; // the rows do not tile [0, total)

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);

/**
 * Reads a pasted table. It must be the shape the server stores and its rows must tile
 * [0, 2^32) in order with no gap or overlap, so a table that cannot be drawn on is refused
 * instead of guessed at.
 */
export const parseCollectTable = (text: string): { table: CollectTable } | { error: CollectTableError } => {
  if (!text.trim()) return { error: "empty" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "json" };
  }
  if (typeof raw !== "object" || raw === null) return { error: "shape" };
  const t = raw as Record<string, unknown>;
  if (t.v !== 1) return { error: typeof t.v === "number" ? "version" : "shape" };
  if (t.total !== COLLECT_TICKET_TOTAL || !Array.isArray(t.rows) || t.rows.length === 0) return { error: "shape" };
  const rows: CollectRow[] = [];
  for (const r of t.rows as unknown[]) {
    if (typeof r !== "object" || r === null) return { error: "shape" };
    const row = r as Record<string, unknown>;
    if (
      !(row.id === null || isInt(row.id)) ||
      !COLLECT_BUCKETS.includes(row.bucket as CollectBucket) ||
      typeof row.type !== "string" ||
      !isInt(row.stars) ||
      !isInt(row.from) ||
      !isInt(row.to) ||
      (row.ton !== undefined && typeof row.ton !== "number")
    ) {
      return { error: "shape" };
    }
    rows.push({
      id: row.id as number | null,
      bucket: row.bucket as CollectBucket,
      type: row.type,
      stars: row.stars,
      ...(row.ton !== undefined ? { ton: row.ton as number } : {}),
      from: row.from,
      to: row.to,
    });
  }
  let next = 0;
  for (const r of rows) {
    if (r.from !== next || r.to <= r.from) return { error: "ranges" };
    next = r.to;
  }
  if (next !== COLLECT_TICKET_TOTAL) return { error: "ranges" };
  return { table: { v: 1, total: COLLECT_TICKET_TOTAL, rows } };
};

/**
 * The canonical text of a parsed table: the server's field order and no spaces, so a table pasted
 * pretty-printed hashes the same as the stored one.
 */
export const canonicalCollectJson = (table: CollectTable) =>
  JSON.stringify({
    v: 1,
    total: table.total,
    rows: table.rows.map((r) => ({
      id: r.id,
      bucket: r.bucket,
      type: r.type,
      stars: r.stars,
      ...(r.ton !== undefined ? { ton: r.ton } : {}),
      from: r.from,
      to: r.to,
    })),
  });

/** CollectTable.Hash: the SHA-256 of the canonical text's UTF-8 bytes, lowercase hex. */
export const collectTableHash = (table: CollectTable) => sha256Hex(new TextEncoder().encode(canonicalCollectJson(table)));

/** CollectTable.RowFor: the row whose half-open range [from, to) holds the ticket. */
export const collectRowFor = (table: CollectTable, ticket: number): CollectRow | null => {
  if (!Number.isInteger(ticket) || ticket < 0 || ticket >= table.total) return null;
  return table.rows.find((r) => ticket < r.to) ?? null;
};

/** A row's chance: its tickets over 2^32. */
export const collectChance = (row: CollectRow) => (row.to - row.from) / COLLECT_TICKET_TOTAL;

/**
 * CollectWishTable.Levels: the "Set your target" steps, in thousandths of the price (×2, ×4, ×8; ×1.5 to
 * ×3 before 2026-10-17). A round records the level it was charged, which on a prize the cap stops early
 * is a MAX level (×2.45), and on a round from the old steps can sit a Star off one (★25 × 1.5 is ★38,
 * level 1520), so any level above ×1 and up to ×8 is checked.
 */
export const COLLECT_WISH_LEVELS = [2000, 4000, 8000] as const;

/** CollectWishTable.MaxLevelMilli: no wish costs more than ×8. */
export const COLLECT_WISH_MAX_LEVEL = 8000;

/** CollectWishTable.CapTickets: on the uncapped pass a wished-for prize never takes more than half the tickets. */
export const COLLECT_WISH_CAP_TICKETS = COLLECT_TICKET_TOTAL / 2;

/** CollectWishTable.CappedMaxTickets: on the capped pass a wished-for prize never takes more than a third. */
export const COLLECT_WISH_CAPPED_MAX_TICKETS = Math.floor(COLLECT_TICKET_TOTAL / 3);

/**
 * CollectWishFormula: which pass derived a round's table (`wishFormula` on the round's proof screen).
 * 1 is the uncapped pass every round drew on until 2026-10-30; 2 is the capped pass since.
 */
export type CollectWishFormula = 1 | 2;
export const COLLECT_WISH_FORMULAS: readonly CollectWishFormula[] = [2, 1];

/** CollectWishTable.IsTargetType: the prize kinds a wish can name. */
const WISH_TYPES = new Set(["Stars", "Gift", "NFT", "Gram", "Premium"]);

/**
 * CollectWishTable.CeilingTickets: the most tickets the target takes at a level on the capped pass. A
 * straight line through 0 at ×1, or k × the plain tickets
 * when that is more; never over a third.
 */
export const collectWishCeiling = (levelMilli: number, plainTickets: bigint): bigint => {
  const total = BigInt(COLLECT_TICKET_TOTAL);
  const level = BigInt(levelMilli);
  const line =
    levelMilli <= 2000 ? (total * (level - 1000n)) / 10000n
    : levelMilli <= 4000 ? (total * level) / 20000n
    : (total * (level + 2000n)) / 30000n;
  const promised = (plainTickets * level) / 1000n;
  const ceiling = line > promised ? line : promised;
  const max = BigInt(COLLECT_WISH_CAPPED_MAX_TICKETS);
  return ceiling > max ? max : ceiling;
};

/** A row the largest remainder left without a ticket takes one from its group's biggest row (the earlier on a tie). */
const keepATicket = (group: number[], into: bigint[]): boolean => {
  for (const i of group.filter((g) => into[g] === 0n)) {
    const big = [...group].sort((a, b) => (into[b] > into[a] ? 1 : into[b] < into[a] ? -1 : a - b))[0];
    if (into[big] <= 1n) return false;
    into[big] -= 1n;
    into[i] = 1n;
  }
  return true;
};

/** `share` tickets to `indices` in proportion to their tickets (`groupTickets`), by largest remainder, ties to the earlier row. */
const shareAmong = (tickets: bigint[], indices: number[], share: bigint, groupTickets: bigint, into: bigint[]) => {
  const rem = new Map<number, bigint>();
  let given = 0n;
  for (const i of indices) {
    const q = tickets[i] * share;
    into[i] = q / groupTickets;
    rem.set(i, q % groupTickets);
    given += into[i];
  }
  const order = [...indices].sort((a, b) => {
    const ra = rem.get(a)!, rb = rem.get(b)!;
    return rb > ra ? 1 : rb < ra ? -1 : a - b;
  });
  for (let k = 0; k < Number(share - given); k++) into[order[k]] += 1n;
};

/**
 * CollectWishTable.Apply: the table an "I want to win" round draws on, re-derived from the pre-wish
 * table the round stores (`preWishTableJson`), or null where the server would not offer it. All
 * whole-number arithmetic, as the server's BigInteger:
 *   EV₀ = Σ tᵢ·sᵢ, T = the target's tickets, v = its Stars, N = 2³² − T, S = EV₀ − T·v
 *   T′  = ⌊(k·EV₀·N − 1000·2³²·S) / (1000·(v·N − S))⌋, k in thousandths
 *   the other rows share 2³² − T′ in proportion to their tickets, by largest remainder, ties to the earlier row.
 * The player pays k × the price and the table is worth k × as much, so the return doesn't move.
 *
 * On the capped pass (formula 2, since 2026-10-30) the target stops at its ceiling (`collectWishCeiling`)
 * and the value left over goes to the other prizes the player could have targeted (worth twice the price
 * or more, never an NFT or Premium row; the prizes worth the list price when there are none), which grow
 * together while the rest shrink together:
 *   C = the target's tickets, M = 2³² − C, R = k·EV₀ − C·v
 *   X = ⌊(R·H·L − M·Lᵥ·H) / (Hᵥ·L − Lᵥ·H)⌋ tickets to the hi rows (H tickets worth Hᵥ), M − X to the lo rows.
 * Where the rows can't carry it, C is the least above the ceiling that leaves every row a ticket (a binary
 * search), never more than T′ and never over a third. A level that would pay more than the
 * target is worth isn't offered. Under the ceiling the capped pass is the uncapped one, byte for byte.
 * Pass the product's stake to also apply the server's rule that a target is worth at least twice it;
 * the capped pass needs it for the price-paid rule, so it refuses without one.
 */
export const deriveWishTable = (
  preWish: CollectTable,
  payoutId: number,
  levelMilli: number,
  stakeStars?: number,
  formula: CollectWishFormula = 2,
): CollectTable | null => {
  if (!Number.isSafeInteger(levelMilli) || levelMilli <= 1000 || levelMilli > COLLECT_WISH_MAX_LEVEL) return null;
  const rows = preWish.rows;
  const matches = rows.map((r, i) => (r.id === payoutId ? i : -1)).filter((i) => i >= 0);
  if (matches.length !== 1) return null;
  const j = matches[0];
  const target = rows[j];
  if (!WISH_TYPES.has(target.type)) return null;
  if (stakeStars !== undefined && (stakeStars <= 0 || target.stars < 2 * stakeStars)) return null;

  const total = BigInt(COLLECT_TICKET_TOTAL);
  const tickets = rows.map((r) => BigInt(r.to - r.from));
  const ev0 = rows.reduce((sum, r, i) => sum + tickets[i] * BigInt(r.stars), 0n);
  const t = tickets[j];
  const v = BigInt(target.stars);
  const n = total - t;
  const s = ev0 - t * v;
  const den = 1000n * (v * n - s);
  if (n <= 0n || den <= 0n) return null;
  const num = BigInt(levelMilli) * ev0 * n - 1000n * total * s;
  if (num <= 0n) return null;
  const tNew = num / den;
  if (tNew <= t) return null;

  const others = rows.map((_, i) => i).filter((i) => i !== j);
  const next = rows.map(() => 0n);
  const uncapped = () => {
    shareAmong(tickets, others, total - tNew, n, next);
    next[j] = tNew;
  };
  if (formula === 1) {
    if (tNew > BigInt(COLLECT_WISH_CAP_TICKETS)) return null;
    uncapped();
  } else {
    if (stakeStars === undefined) return null;
    const level = BigInt(levelMilli);
    const stake = BigInt(stakeStars);
    if (v * 1000n < level * stake) return null; // a hit is worth at least the price paid
    const ceiling = collectWishCeiling(levelMilli, t);
    if (tNew <= ceiling) uncapped();
    else {
      // The rows that share the surplus: the other prizes the player could have targeted (worth twice the
      // price or more), never a collectible with a pool (an NFT, a Premium pass: a target or nothing).
      const liftable = (i: number) => rows[i].type !== "NFT" && rows[i].type !== "Premium";
      let hi = others.filter((i) => liftable(i) && rows[i].stars >= 2 * stakeStars);
      if (hi.length === 0) hi = others.filter((i) => liftable(i) && rows[i].stars >= stakeStars);
      const lo = others.filter((i) => !hi.includes(i));
      if (hi.length === 0 || lo.length === 0) return null;
      const sum = (ix: number[], f: (i: number) => bigint) => ix.reduce((a, i) => a + f(i), 0n);
      const ht = sum(hi, (i) => tickets[i]), hv = sum(hi, (i) => tickets[i] * BigInt(rows[i].stars));
      const lt = sum(lo, (i) => tickets[i]), lv = sum(lo, (i) => tickets[i] * BigInt(rows[i].stars));
      const split = hv * lt - lv * ht;
      if (split <= 0n) return null;
      const trySplit = (c: bigint): boolean => {
        const m = total - c;
        const r1000 = level * ev0 - 1000n * c * v;
        const x = (r1000 * ht * lt - 1000n * m * lv * ht) / (1000n * split);
        if (x < BigInt(hi.length) || m - x < BigInt(lo.length)) return false;
        shareAmong(tickets, hi, x, ht, next);
        shareAmong(tickets, lo, m - x, lt, next);
        next[j] = c;
        return keepATicket(hi, next) && keepATicket(lo, next);
      };
      let low = ceiling;
      let high = tNew < BigInt(COLLECT_WISH_CAPPED_MAX_TICKETS) ? tNew : BigInt(COLLECT_WISH_CAPPED_MAX_TICKETS);
      if (high < low || !trySplit(high)) return null;
      if (!trySplit(low)) {
        while (high - low > 1n) {
          const mid = (low + high) / 2n;
          if (trySplit(mid)) high = mid;
          else low = mid;
        }
        trySplit(high);
      }
    }
  }

  let from = 0;
  const out: CollectRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (next[i] === 0n) return null;
    const to = from + Number(next[i]);
    out.push({ ...rows[i], from, to });
    from = to;
  }
  return { v: 1, total: COLLECT_TICKET_TOTAL, rows: out };
};

/** CollectWishTable.Factor: how many times likelier the wished-for prize is, ⌊T′ / T⌋ (the app's "N×"). */
export const collectWishFactor = (preWish: CollectTable, boosted: CollectTable, payoutId: number) => {
  const sum = (t: CollectTable) => t.rows.filter((r) => r.id === payoutId).reduce((a, r) => a + (r.to - r.from), 0);
  const before = sum(preWish);
  return before > 0 ? Math.floor(sum(boosted) / before) : 0;
};
