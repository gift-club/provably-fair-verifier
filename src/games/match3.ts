/**
 * Match-3 for the public provably fair checker. Paid rounds since 2026-10-28 are the Gift round:
 * a gift sealed before the first move, a fixed 7x7 board, 15 moves and 60 seconds, paid on pay
 * table v4. The v3 "Gift Vault" rounds (5x5 or 7x7, 28-35 s) and the v1/v2 rounds before them stay
 * checkable here. All of them share the deal (board and gem sequence), the hidden gift, the
 * payout, and an exact port of the board engine so a round's moves can be replayed to its score.
 * v4 is v3 with only the thresholds changed (7x7 only): the 15-move / 60-second format changes
 * the tier thresholds, not the maths. The paid Gift duel (2026-10-08 to 2026-10-27) is gone from
 * the API and the checker.
 *
 * Backend sources, read 2026-10-27:
 * - `Services/Games/Match3PaidService.cs`: `DealRoundAsync` (both the Stars and the Gram start
 *   call it), `SettleAsync` (the one payout path), `GetVerificationAsync`.
 * - `Services/Games/Match3PaidRound.cs`: the fixed 7x7 board, 15 moves, 60 seconds.
 * - `Services/Games/Match3Engine.cs` (rules v2): `FloatBudget`, `PaidFloatBudget`,
 *   `GenerateBoardFromFloats`, `GenerateGemSequenceFromFloats`, `GemSequenceLengthForSize`,
 *   `HasPossibleMoves`, `ReshuffleBoard`, `ReplayGame` / `ProcessMove` and its `Resolver`. The
 *   engine half follows `the app's match3Engine.ts`, the app's parity-tested port,
 *   without its animation events.
 * - `Services/Games/Match3Math.cs`: pay tables V1-V4 (`Current` is V4), `DrawGift`, `ScoreTier`,
 *   `PlayFactor`, `TotalMultiplier`, `PayoutStars` (`PayoutCalculator.ToStars`).
 *
 * Float order, one stream per round (nonce): floats [0, FloatBudget) deal the board (row by row,
 * a colour is (int)(f × 5), redrawn while it would complete a run of three, at most 50 tries a
 * cell) and then the gem sequence (boardSize² × 12 colours), indexes wrapping inside the budget.
 * If the dealt board has no move it is reshuffled from the gem sequence. Float FloatBudget is the
 * gift (weighted out of 1000), float FloatBudget + 1 the Stars rounding float. A Gram round draws
 * the same FloatBudget + 2 floats and leaves the rounding float unused.
 *
 * The score comes from the player's moves, which the server replays; the app shows the score
 * but not the moves, so the checker takes the score as an input. A score only counts when the
 * round was submitted 28–35 s after it started; otherwise (and for a round never submitted) the
 * round settles at tier 0.
 */
import { toStars, type PfFloat, type Ratio } from "../provablyFair.js";

// ---------------------------------------------------------------------------------------
// Pay tables (Match3Math)

export type Match3BoardSize = 5 | 7;
export const MATCH3_BOARD_SIZES: Match3BoardSize[] = [5, 7];
export type Match3PayTableVersion = 1 | 2 | 3 | 4;
export const MATCH3_PAY_TABLE_VERSIONS: Match3PayTableVersion[] = [1, 2, 3, 4];
export const MATCH3_CURRENT_PAY_TABLE: Match3PayTableVersion = 4;
/** v4 (the Gift round) is 7x7 only: its pay table has no 5x5 row. */
export const MATCH3_PAID_ROUND_BOARD_SIZE: Match3BoardSize = 7;
export const MATCH3_PAID_ROUND_MOVES = 15;
export const MATCH3_PAID_ROUND_SECONDS = 60;

/** `Match3Options.MaxWinTon` (appsettings.json). The top multiplier, 25×, never reaches it. */
export const MATCH3_MAX_WIN_GRAM = "1000";
export const MATCH3_STARS_BETS = [1, 5, 10, 20, 50, 100] as const;
export const MATCH3_WEIGHT_TOTAL = 1000;

export interface Match3PayTable {
  version: Match3PayTableVersion;
  /** [multiplier, weight out of 1000] */
  gifts: [string, number][];
  scoreBonuses: string[];
  tierThresholds: Partial<Record<Match3BoardSize, [number, number, number]>>;
  /** Share of the gift each tier unlocks (v3, v4). Null: the whole gift (v1, v2). */
  playFactors: string[] | null;
}

const V1_GIFTS: [string, number][] = [
  ["25", 2], ["10", 7], ["5", 21], ["3", 40], ["2", 75], ["1.4", 100], ["1", 220], ["0.4", 150], ["0", 385],
];

export const MATCH3_PAY_TABLES: Record<Match3PayTableVersion, Match3PayTable> = {
  1: {
    version: 1,
    gifts: V1_GIFTS,
    scoreBonuses: ["0", "0.025", "0.05", "0.07"],
    tierThresholds: { 5: [200, 325, 500], 7: [500, 700, 1000] },
    playFactors: null,
  },
  2: {
    version: 2,
    gifts: V1_GIFTS,
    scoreBonuses: ["0", "0.025", "0.05", "0.07"],
    tierThresholds: { 5: [550, 900, 1400], 7: [1450, 2150, 3250] },
    playFactors: null,
  },
  3: {
    version: 3,
    gifts: [["25", 2], ["10", 5], ["5", 15], ["3", 35], ["2", 65], ["1.5", 100], ["1", 222], ["0.5", 256], ["0.25", 300]],
    scoreBonuses: ["0", "0", "0", "0"],
    tierThresholds: { 5: [150, 300, 450], 7: [600, 900, 1150] },
    playFactors: ["0.35", "0.75", "0.95", "1"],
  },
  // Gift round: v3's gifts, factors and offsets, 7x7 thresholds only.
  4: {
    version: 4,
    gifts: [["25", 2], ["10", 5], ["5", 15], ["3", 35], ["2", 65], ["1.5", 100], ["1", 222], ["0.5", 256], ["0.25", 300]],
    scoreBonuses: ["0", "0", "0", "0"],
    tierThresholds: { 7: [1300, 1600, 1900] },
    playFactors: ["0.35", "0.75", "0.95", "1"],
  },
};

/** Board sizes a pay table version can score: 5 and 7 up to v3, 7 only at v4. */
export const match3BoardSizesFor = (version: Match3PayTableVersion): Match3BoardSize[] =>
  MATCH3_BOARD_SIZES.filter((size) => MATCH3_PAY_TABLES[version].tierThresholds[size] !== undefined);

// Exact decimal arithmetic on ratios (the server uses decimal).
const parse = (decimal: string): Ratio => {
  const [whole, frac = ""] = decimal.split(".");
  const den = 10n ** BigInt(frac.length);
  return { num: BigInt(whole) * den + BigInt(frac || "0"), den };
};
const mul = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.num, den: a.den * b.den });
const add = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });

/** A ratio whose denominator is a power of ten, as the shortest decimal string: 875/10000 → "0.0875". */
export const ratioToDecimal = (r: Ratio): string => {
  let num = r.num;
  let den = r.den;
  while (den > 1n && num % 10n === 0n && den % 10n === 0n) {
    num /= 10n;
    den /= 10n;
  }
  const digits = den.toString().length - 1;
  if (digits === 0) return num.toString();
  const s = num.toString().padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
};

/** `Match3Math.DrawGift`: slot = (int)(float × 1000), walked through the weights. */
export const match3Gift = (version: Match3PayTableVersion, giftFloat: number): string => {
  let slot = Math.trunc(giftFloat * MATCH3_WEIGHT_TOTAL);
  if (slot < 0) slot = 0;
  if (slot >= MATCH3_WEIGHT_TOTAL) slot = MATCH3_WEIGHT_TOTAL - 1;
  let cumulative = 0;
  for (const [multiplier, weight] of MATCH3_PAY_TABLES[version].gifts) {
    cumulative += weight;
    if (slot < cumulative) return multiplier;
  }
  throw new Error("Gift weights do not sum to 1000");
};

/** `Match3Math.ScoreTier`: 0–3, the number of thresholds the score reaches. */
export const match3ScoreTier = (version: Match3PayTableVersion, boardSize: Match3BoardSize, score: number) => {
  const thresholds = MATCH3_PAY_TABLES[version].tierThresholds[boardSize];
  if (!thresholds) throw new Error(`Pay table v${version} has no ${boardSize}x${boardSize} board`);
  return thresholds.filter((t) => score >= t).length;
};

/** `Match3Math.TotalMultiplier`: gift × play factor + bonus, exact. */
export const match3Multiplier = (version: Match3PayTableVersion, gift: string, tier: number): Ratio => {
  const table = MATCH3_PAY_TABLES[version];
  const factor = parse(table.playFactors?.[tier] ?? "1");
  return add(mul(parse(gift), factor), parse(table.scoreBonuses[tier]));
};

// ---------------------------------------------------------------------------------------
// Floats

/** `Match3Engine.FloatBudget`: floats the deal may use. */
export const match3FloatBudget = (boardSize: Match3BoardSize) => (boardSize === 7 ? 1500 : 1000);

/** `Match3Engine.PaidFloatBudget`: what a round draws (and verify returns), Stars or Gram. */
export const match3FloatsFor = {
  stars: (boardSize: Match3BoardSize) => match3FloatBudget(boardSize) + 2,
  gram: (boardSize: Match3BoardSize) => match3FloatBudget(boardSize) + 2,
};

export const match3GemSequenceLength = (boardSize: number) => boardSize * boardSize * 12;

// ---------------------------------------------------------------------------------------
// Engine (Match3Engine, rules v2)

export const GEM_COLOR_COUNT = 5;
export const EMPTY_CELL = -1;
/** Row blaster of colour c is ROW_BLASTER + c; column blaster COL_BLASTER + c; bomb BOMB + c. */
export const ROW_BLASTER = 20;
export const COL_BLASTER = 30;
export const BOMB = 40;
/** The colourless prism. */
export const PRISM = 50;

const GEM_POINTS = 10;
const LINE_MADE_POINTS = 20;
const BOMB_MADE_POINTS = 30;
const PRISM_MADE_POINTS = 50;
const PRISM_FIRED_POINTS = 50;
const COMBO_POINTS = 50;
const MAX_COMBO_MULTIPLIER = 5;
const MAX_CASCADE_STEPS = 60;
const MAX_RESHUFFLES = 20;

/** A swap of two adjacent cells, or a tap on a special when from equals to. */
export interface Match3Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface Match3ScoreBreakdown {
  totalMatches: number;
  maxCombo: number;
  gemsCleared: number;
  specialsCreated: number;
  blastersFired: number;
  bombsDetonated: number;
  prismsFired: number;
  combosFired: number;
}

interface MoveResult extends Omit<Match3ScoreBreakdown, "totalMatches"> {
  valid: boolean;
  score: number;
  matchCount: number;
}

type Cell = [number, number];

interface MatchGroup {
  color: number;
  cells: Set<string>;
  orderedCells: Cell[];
  maxRun: number;
  longestIsHorizontal: boolean;
  hasHorizontal: boolean;
  hasVertical: boolean;
  intersection: Cell | null;
}

const cellKey = (r: number, c: number) => `${r},${c}`;
export const isSpecial = (gem: number) => gem >= ROW_BLASTER;

/** The colour a cell matches by: 0..4, or -1 for empty and the prism. */
export const colorOf = (gem: number) => {
  if (gem >= 0 && gem < GEM_COLOR_COUNT) return gem;
  if (gem >= ROW_BLASTER && gem < PRISM) return gem % 10;
  return -1;
};

const kindOf = (gem: number) => (gem >= PRISM ? PRISM : gem >= ROW_BLASTER ? Math.floor(gem / 10) * 10 : 0);
const inBounds = (row: number, col: number, size: number) => row >= 0 && row < size && col >= 0 && col < size;
const swap = (board: number[][], r1: number, c1: number, r2: number, c2: number) => {
  const t = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = t;
};
const cloneBoard = (board: number[][]) => board.map((row) => [...row]);

const addRun = (group: MatchGroup, cells: Cell[], horizontal: boolean) => {
  for (const [r, c] of cells) {
    const key = cellKey(r, c);
    if (group.cells.has(key)) {
      if (group.intersection === null && (horizontal ? group.hasVertical : group.hasHorizontal)) group.intersection = [r, c];
      continue;
    }
    group.cells.add(key);
    group.orderedCells.push([r, c]);
  }
  if (horizontal) group.hasHorizontal = true;
  else group.hasVertical = true;
  if (cells.length > group.maxRun) {
    group.maxRun = cells.length;
    group.longestIsHorizontal = horizontal;
  }
};

/** `FindMatches`: horizontal runs first, then vertical, merged where they share a cell. */
const findMatches = (board: number[][]): MatchGroup[] => {
  const size = board.length;
  const runs: { cells: Cell[]; horizontal: boolean; color: number }[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      const color = colorOf(board[r][c]);
      let len = 1;
      while (color >= 0 && c + len < size && colorOf(board[r][c + len]) === color) len++;
      if (color >= 0 && len >= 3) runs.push({ cells: Array.from({ length: len }, (_, i) => [r, c + i] as Cell), horizontal: true, color });
      c += len;
    }
  }
  for (let c = 0; c < size; c++) {
    let r = 0;
    while (r < size) {
      const color = colorOf(board[r][c]);
      let len = 1;
      while (color >= 0 && r + len < size && colorOf(board[r + len][c]) === color) len++;
      if (color >= 0 && len >= 3) runs.push({ cells: Array.from({ length: len }, (_, i) => [r + i, c] as Cell), horizontal: false, color });
      r += len;
    }
  }

  const groups: MatchGroup[] = [];
  const used = new Array<boolean>(runs.length).fill(false);
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const group: MatchGroup = {
      color: runs[i].color,
      cells: new Set(),
      orderedCells: [],
      maxRun: 0,
      longestIsHorizontal: false,
      hasHorizontal: false,
      hasVertical: false,
      intersection: null,
    };
    addRun(group, runs[i].cells, runs[i].horizontal);
    let merged: boolean;
    do {
      merged = false;
      for (let j = i + 1; j < runs.length; j++) {
        if (used[j] || runs[j].color !== group.color) continue;
        if (!runs[j].cells.some(([r, c]) => group.cells.has(cellKey(r, c)))) continue;
        addRun(group, runs[j].cells, runs[j].horizontal);
        used[j] = true;
        merged = true;
      }
    } while (merged);
    groups.push(group);
  }
  return groups;
};

const applyGravity = (board: number[][]) => {
  const size = board.length;
  for (let c = 0; c < size; c++) {
    let writeRow = size - 1;
    for (let r = size - 1; r >= 0; r--) {
      if (board[r][c] !== EMPTY_CELL) {
        if (r !== writeRow) {
          board[writeRow][c] = board[r][c];
          board[r][c] = EMPTY_CELL;
        }
        writeRow--;
      }
    }
  }
};

/** Column-major, top to bottom, from the gem sequence (wrapping). */
const fillFromSequence = (board: number[][], seq: number[], seqIndex: { value: number }) => {
  const size = board.length;
  for (let c = 0; c < size; c++)
    for (let r = 0; r < size; r++)
      if (board[r][c] === EMPTY_CELL) {
        board[r][c] = seq[seqIndex.value % seq.length];
        seqIndex.value++;
      }
};

/** `HasPossibleMoves`: any special, or any adjacent swap that makes a match. */
export const match3HasPossibleMoves = (board: number[][]) => {
  const size = board.length;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (isSpecial(board[r][c])) return true;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size) {
        swap(board, r, c, r, c + 1);
        const hit = findMatches(board).length > 0;
        swap(board, r, c, r, c + 1);
        if (hit) return true;
      }
      if (r + 1 < size) {
        swap(board, r, c, r + 1, c);
        const hit = findMatches(board).length > 0;
        swap(board, r, c, r + 1, c);
        if (hit) return true;
      }
    }
  }
  return false;
};

const wouldCreateMatch = (board: number[][], row: number, col: number, gem: number) =>
  (col >= 2 && board[row][col - 1] === gem && board[row][col - 2] === gem) ||
  (row >= 2 && board[row - 1][col] === gem && board[row - 2][col] === gem);

/** `ReshuffleBoard` (rules v2). */
const reshuffleBoard = (board: number[][], seq: number[], seqIndex: { value: number }) => {
  const size = board.length;
  const gems: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (!isSpecial(board[r][c]) && board[r][c] !== EMPTY_CELL) gems.push(board[r][c]);

  for (let attempt = 0; attempt < MAX_RESHUFFLES; attempt++) {
    for (let i = gems.length - 1; i > 0; i--) {
      const swapWith = seq[seqIndex.value % seq.length] % (i + 1);
      seqIndex.value++;
      const t = gems[i];
      gems[i] = gems[swapWith];
      gems[swapWith] = t;
    }
    let gemIdx = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!isSpecial(board[r][c])) board[r][c] = gems[gemIdx++];
    if (findMatches(board).length === 0 && match3HasPossibleMoves(board)) return;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isSpecial(board[r][c])) continue;
      let gem = seq[seqIndex.value % seq.length];
      seqIndex.value++;
      for (let tries = 0; tries < GEM_COLOR_COUNT && wouldCreateMatch(board, r, c, gem); tries++) gem = (gem + 1) % GEM_COLOR_COUNT;
      board[r][c] = gem;
    }
  }
};

class Resolver {
  private readonly size: number;
  private readonly queue: [number, number, number][] = [];
  private readonly reserved = new Set<string>();
  level = 1;

  constructor(
    private readonly board: number[][],
    private readonly result: MoveResult,
  ) {
    this.size = board.length;
  }

  private get mult() {
    return Math.min(this.level, MAX_COMBO_MULTIPLIER);
  }

  take(r: number, c: number) {
    const gem = this.board[r][c];
    if (gem === EMPTY_CELL) return gem;
    this.board[r][c] = EMPTY_CELL;
    this.result.score += GEM_POINTS * this.mult;
    this.result.gemsCleared++;
    return gem;
  }

  hit(r: number, c: number) {
    if (!inBounds(r, c, this.size) || this.reserved.has(cellKey(r, c))) return;
    const gem = this.board[r][c];
    if (gem === EMPTY_CELL) return;
    this.take(r, c);
    if (isSpecial(gem)) this.queue.push([r, c, gem]);
  }

  fire(r: number, c: number, gem: number) {
    this.queue.push([r, c, gem]);
  }

  runQueue() {
    for (let next = this.queue.shift(); next; next = this.queue.shift()) {
      const [r, c, gem] = next;
      const kind = kindOf(gem);
      if (kind === ROW_BLASTER) {
        this.result.blastersFired++;
        for (let j = 0; j < this.size; j++) this.hit(r, j);
      } else if (kind === COL_BLASTER) {
        this.result.blastersFired++;
        for (let i = 0; i < this.size; i++) this.hit(i, c);
      } else if (kind === BOMB) {
        this.result.bombsDetonated++;
        this.hitSquare(r, c, 1);
      } else {
        this.result.prismsFired++;
        this.result.score += PRISM_FIRED_POINTS * this.mult;
        const color = this.mostCommonColor();
        if (color >= 0) this.hitColor(color);
      }
    }
  }

  private hitSquare(r: number, c: number, radius: number) {
    for (let i = r - radius; i <= r + radius; i++) for (let j = c - radius; j <= c + radius; j++) this.hit(i, j);
  }

  private hitColor(color: number) {
    for (let i = 0; i < this.size; i++) for (let j = 0; j < this.size; j++) if (colorOf(this.board[i][j]) === color) this.hit(i, j);
  }

  private mostCommonColor() {
    const counts = new Array<number>(GEM_COLOR_COUNT).fill(0);
    for (let i = 0; i < this.size; i++)
      for (let j = 0; j < this.size; j++) {
        const color = colorOf(this.board[i][j]);
        if (color >= 0) counts[color]++;
      }
    let best = -1;
    for (let k = 0; k < GEM_COLOR_COUNT; k++) if (counts[k] > 0 && (best < 0 || counts[k] > counts[best])) best = k;
    return best;
  }

  swapSpecials(ar: number, ac: number, aGem: number, br: number, bc: number, bGem: number) {
    const aSpecial = isSpecial(aGem);
    const bSpecial = isSpecial(bGem);
    if (aSpecial && bSpecial) {
      this.result.combosFired++;
      this.result.score += COMBO_POINTS * this.mult;
      this.take(ar, ac);
      this.take(br, bc);
      const aKind = kindOf(aGem);
      const bKind = kindOf(bGem);
      if (aKind === PRISM && bKind === PRISM) {
        this.result.prismsFired += 2;
        for (let i = 0; i < this.size; i++) for (let j = 0; j < this.size; j++) this.hit(i, j);
      } else if (aKind === PRISM || bKind === PRISM) {
        this.result.prismsFired++;
        const other = aKind === PRISM ? bGem : aGem;
        this.convert(colorOf(other), kindOf(other));
      } else if (aKind === BOMB && bKind === BOMB) {
        this.result.bombsDetonated += 2;
        this.hitSquare(ar, ac, 2);
      } else if (aKind === BOMB || bKind === BOMB) {
        this.result.blastersFired++;
        this.result.bombsDetonated++;
        for (let i = ar - 1; i <= ar + 1; i++) for (let j = 0; j < this.size; j++) this.hit(i, j);
        for (let j = ac - 1; j <= ac + 1; j++) for (let i = 0; i < this.size; i++) this.hit(i, j);
      } else {
        this.result.blastersFired += 2;
        for (let j = 0; j < this.size; j++) this.hit(ar, j);
        for (let i = 0; i < this.size; i++) this.hit(i, ac);
      }
      return;
    }

    const [sr, sc, sGem, oGem] = aSpecial ? [ar, ac, aGem, bGem] : [br, bc, bGem, aGem];
    this.take(sr, sc);
    if (kindOf(sGem) === PRISM) {
      this.result.prismsFired++;
      this.result.score += PRISM_FIRED_POINTS * this.mult;
      this.hitColor(colorOf(oGem));
    } else {
      this.fire(sr, sc, sGem);
    }
  }

  private convert(color: number, kind: number) {
    const converted: [number, number, number][] = [];
    for (let i = 0; i < this.size; i++)
      for (let j = 0; j < this.size; j++) {
        if (colorOf(this.board[i][j]) !== color) continue;
        const gem = kind === BOMB ? BOMB + color : (i + j) % 2 === 0 ? ROW_BLASTER + color : COL_BLASTER + color;
        this.board[i][j] = gem;
        converted.push([i, j, gem]);
      }
    for (const [i, j, gem] of converted) {
      if (this.board[i][j] !== gem) continue;
      this.take(i, j);
      this.fire(i, j, gem);
    }
  }

  clearGroups(groups: MatchGroup[], prefer: Cell | null, second: Cell | null) {
    const placements: [number, number, number][] = [];
    for (const group of groups) {
      this.result.matchCount++;
      const made = specialFor(group);
      if (made < 0) continue;
      const [pr, pc] = placementFor(group, made, prefer, second);
      if (placements.some(([r, c]) => r === pr && c === pc)) continue;
      placements.push([pr, pc, made]);
    }
    for (const group of groups) for (const [r, c] of group.orderedCells) this.hit(r, c);
    for (const [r, c, gem] of placements) {
      this.board[r][c] = gem;
      this.reserved.add(cellKey(r, c));
      this.result.specialsCreated++;
      const k = kindOf(gem);
      this.result.score += (k === PRISM ? PRISM_MADE_POINTS : k === BOMB ? BOMB_MADE_POINTS : LINE_MADE_POINTS) * this.mult;
    }
    this.runQueue();
    this.reserved.clear();
  }
}

const specialFor = (group: MatchGroup) => {
  if (group.maxRun >= 5) return PRISM;
  if (group.hasHorizontal && group.hasVertical) return BOMB + group.color;
  if (group.maxRun === 4) return group.longestIsHorizontal ? COL_BLASTER + group.color : ROW_BLASTER + group.color;
  return -1;
};

const placementFor = (group: MatchGroup, made: number, prefer: Cell | null, second: Cell | null): Cell => {
  if (prefer && group.cells.has(cellKey(prefer[0], prefer[1]))) return prefer;
  if (second && group.cells.has(cellKey(second[0], second[1]))) return second;
  if (kindOf(made) === BOMB && group.intersection) return group.intersection;
  return [...group.orderedCells].sort((a, b) => b[0] - a[0] || a[1] - b[1])[0];
};

/** `ProcessMove`: one move on the board (mutated), a tap when from equals to. */
export const match3ProcessMove = (board: number[][], move: Match3Move, seq: number[], seqIndex: { value: number }): MoveResult => {
  const result: MoveResult = {
    valid: false, score: 0, matchCount: 0, maxCombo: 0, gemsCleared: 0, specialsCreated: 0,
    blastersFired: 0, bombsDetonated: 0, prismsFired: 0, combosFired: 0,
  };
  const size = board.length;
  if (!inBounds(move.fromRow, move.fromCol, size) || !inBounds(move.toRow, move.toCol, size)) return result;
  const dr = Math.abs(move.fromRow - move.toRow);
  const dc = Math.abs(move.fromCol - move.toCol);
  const tap = dr + dc === 0;
  if (!tap && dr + dc !== 1) return result;

  const step = new Resolver(board, result);
  if (tap) {
    const gem = board[move.fromRow][move.fromCol];
    if (!isSpecial(gem)) return result;
    result.valid = true;
    step.level = 1;
    step.take(move.fromRow, move.fromCol);
    step.fire(move.fromRow, move.fromCol, gem);
    step.runQueue();
  } else {
    const fromGem = board[move.fromRow][move.fromCol];
    const toGem = board[move.toRow][move.toCol];
    if (fromGem === EMPTY_CELL || toGem === EMPTY_CELL) return result;
    swap(board, move.fromRow, move.fromCol, move.toRow, move.toCol);
    if (isSpecial(fromGem) || isSpecial(toGem)) {
      result.valid = true;
      step.level = 1;
      step.swapSpecials(move.toRow, move.toCol, fromGem, move.fromRow, move.fromCol, toGem);
      step.runQueue();
    } else {
      const matches = findMatches(board);
      if (matches.length === 0) {
        swap(board, move.fromRow, move.fromCol, move.toRow, move.toCol);
        return result;
      }
      result.valid = true;
      step.level = 1;
      step.clearGroups(matches, [move.toRow, move.toCol], [move.fromRow, move.fromCol]);
    }
  }

  result.maxCombo = 1;
  applyGravity(board);
  fillFromSequence(board, seq, seqIndex);
  for (let i = 0; i < MAX_CASCADE_STEPS; i++) {
    const cascade = findMatches(board);
    if (cascade.length === 0) break;
    step.level++;
    result.maxCombo = step.level;
    step.clearGroups(cascade, null, null);
    applyGravity(board);
    fillFromSequence(board, seq, seqIndex);
  }
  if (!match3HasPossibleMoves(board)) reshuffleBoard(board, seq, seqIndex);
  return result;
};

/** `Match3Engine.ReplayGame`: the score the server gives a round's moves. Invalid moves are skipped. */
export const match3Replay = (initialBoard: number[][], gemSequence: number[], moves: Match3Move[]) => {
  const board = cloneBoard(initialBoard);
  const seqIndex = { value: 0 };
  const breakdown: Match3ScoreBreakdown = {
    totalMatches: 0, maxCombo: 0, gemsCleared: 0, specialsCreated: 0,
    blastersFired: 0, bombsDetonated: 0, prismsFired: 0, combosFired: 0,
  };
  let totalScore = 0;
  for (const move of moves) {
    const r = match3ProcessMove(board, move, gemSequence, seqIndex);
    if (!r.valid) continue;
    totalScore += r.score;
    breakdown.totalMatches += r.matchCount;
    breakdown.gemsCleared += r.gemsCleared;
    breakdown.specialsCreated += r.specialsCreated;
    breakdown.blastersFired += r.blastersFired;
    breakdown.bombsDetonated += r.bombsDetonated;
    breakdown.prismsFired += r.prismsFired;
    breakdown.combosFired += r.combosFired;
    if (r.maxCombo > breakdown.maxCombo) breakdown.maxCombo = r.maxCombo;
  }
  return { totalScore, breakdown, finalBoard: board };
};

// ---------------------------------------------------------------------------------------
// The round

/**
 * `Match3PaidService.DealRound`: the board (board[row][col], colours 0–4) and gem sequence the
 * player was dealt, and the two floats after the deal's budget. Pass `match3FloatsFor.stars(size)`
 * floats.
 */
export const match3Deal = (floats: PfFloat[], boardSize: Match3BoardSize) => {
  const budget = match3FloatBudget(boardSize);
  if (floats.length < budget + 2) throw new Error(`Match-3 needs ${budget + 2} floats on a ${boardSize}x${boardSize} board`);
  const boardFloats = floats.slice(0, budget);
  let fi = 0;
  const next = () => Math.trunc(boardFloats[fi++ % boardFloats.length].value * GEM_COLOR_COUNT);

  // GenerateBoard: row by row, redraw while the colour would complete a run (at most 50 draws).
  const board: number[][] = Array.from({ length: boardSize }, () => new Array<number>(boardSize).fill(0));
  for (let r = 0; r < boardSize; r++)
    for (let c = 0; c < boardSize; c++) {
      let gem: number;
      let attempts = 0;
      do {
        gem = next();
        attempts++;
      } while (attempts < 50 && wouldCreateMatch(board, r, c, gem));
      board[r][c] = gem;
    }
  const boardFloatsUsed = fi;

  const gemSequence = Array.from({ length: match3GemSequenceLength(boardSize) }, () => next());

  const reshuffled = !match3HasPossibleMoves(board);
  const seqIndex = { value: 0 };
  if (reshuffled) reshuffleBoard(board, gemSequence, seqIndex);

  return {
    board,
    gemSequence,
    /** Where the gem sequence stands after the deal (a reshuffle eats some). */
    seqIndex: seqIndex.value,
    boardFloatsUsed,
    reshuffled,
    giftFloat: floats[budget],
    roundingFloat: floats[budget + 1],
  };
};

export interface Match3RoundInput {
  boardSize: Match3BoardSize;
  /** The round's score (`serverScore`). */
  score: number;
  /** False when the score did not count (submitted too early or late, or never): tier 0. */
  scoreCounted?: boolean;
  /** `payTableVersion` of the round; 4 for every round since 2026-10-28 (3 before, 2026-09-23 on). */
  payTableVersion?: Match3PayTableVersion;
}

/** The whole round: deal, gift, tier and the multiplier it pays. */
export const match3Outcome = (floats: PfFloat[], input: Match3RoundInput) => {
  const version = input.payTableVersion ?? MATCH3_CURRENT_PAY_TABLE;
  const deal = match3Deal(floats, input.boardSize);
  const gift = match3Gift(version, deal.giftFloat.value);
  const tier = input.scoreCounted === false ? 0 : match3ScoreTier(version, input.boardSize, input.score);
  const multiplierRatio = match3Multiplier(version, gift, tier);
  const table = MATCH3_PAY_TABLES[version];
  return {
    ...deal,
    payTableVersion: version,
    gift,
    tier,
    playFactor: table.playFactors?.[tier] ?? "1",
    bonus: table.scoreBonuses[tier],
    multiplier: ratioToDecimal(multiplierRatio),
    multiplierRatio,
  };
};

/** `Match3Math.PayoutStars`: `PayoutCalculator.ToStars` with the round's rounding float. */
export const match3StarsPayout = (bet: number, outcome: { multiplierRatio: Ratio; roundingFloat: PfFloat }) =>
  toStars(bet, outcome.multiplierRatio, outcome.roundingFloat);
