import { describe, expect, it } from "vitest";
import vectors from "./blackjack.vectors.json";
import { hexToBytes, ratio } from "../provablyFair.js";
import {
  BLACKJACK,
  BLACKJACK_RULE_SETS,
  BLACKJACK_V1,
  blackjackFloats,
  blackjackGramPayout,
  blackjackRound,
  blackjackShoe,
  blackjackStarsPayout,
  blackjackTotal,
  parseBlackjackScript,
  ratioDecimal,
  type BlackjackRules,
  type BlackjackRound,
} from "./blackjack.js";
import { BLACKJACK_DUEL, blackjackDuelMatch, parseDuelHands } from "./blackjack-duel.js";
import { pvpGramPayout, pvpStarsPayout } from "./pvp-pot.js";

/**
 * Pins the Blackjack and Blackjack Duel ports to vectors the backend's own code produced
 * (`scripts/pf-vectors/blackjack.cs`): BlackjackMath.ShoeFor, BlackjackHand.Replay,
 * BlackjackDuel.Settle / Compare, PayoutCalculator.ToStars on float 311 and PvpStakeLedger.Pot.
 * A failure here means the server's draw or rules changed: regenerate the vectors and update the
 * port in the same change.
 */

const rulesOf = (r: (typeof vectors.soloCases)[number]["rules"]): BlackjackRules => r as BlackjackRules;

const seatLooks = (round: BlackjackRound) =>
  round.state.hands.map((h) => ({
    cards: h.cards,
    stakes: h.stakes,
    doubled: h.doubled,
    fromSplit: h.fromSplit,
    splitAces: h.splitAces,
  }));

describe("Blackjack constants match the backend", () => {
  const k = vectors.constants;
  it("shoe and float order", () => {
    expect(BLACKJACK.decks).toBe(k.decks);
    expect(BLACKJACK.shoeSize).toBe(k.shoeSize);
    expect(BLACKJACK.shuffleFloats).toBe(k.shuffleFloats);
    expect(BLACKJACK.floatsPerHand).toBe(k.floatsPerHand);
    expect(BLACKJACK.roundingFloatIndex).toBe(k.roundingFloatIndex);
    expect(BLACKJACK.maxPlayerCards).toBe(k.maxPlayerCards);
    expect(BLACKJACK.maxDealerCards).toBe(k.maxDealerCards);
    expect(BLACKJACK.maxHands).toBe(k.maxHands);
  });
  it("payout caps and the duel's length", () => {
    expect(BLACKJACK.maxWinStars).toBe(k.maxWinStars);
    expect(BLACKJACK.maxWinGram).toBe(k.maxWinTon);
    expect(BLACKJACK_DUEL.handsToWin).toBe(k.handsToWin);
  });
  it("the published rule sets", () => {
    expect([...BLACKJACK_RULE_SETS]).toEqual(k.published);
    expect(BLACKJACK_V1.version).toBe(k.current);
  });
});

describe("Blackjack vectors cover what the checker has to get right", () => {
  const tags = new Set(vectors.soloCases.filter((c) => c.rules.version === 1).flatMap((c) => c.tags));
  it.each([
    "blackjack", "bothBlackjack", "dealerBlackjackAce", "dealerBlackjackTen", "dealerBlackjackBeatsPlayer", "bust", "allBust", "push",
    "double", "doubleWin", "doubleLoss", "doublePush", "split", "splitAces", "splitBothWin", "splitBothLose", "splitMixed",
    "split21NotBlackjack", "softHit", "softFinal", "dealerDrew", "dealerDrewMany", "dealerBust", "dealerHitsSoft17", "win", "loss",
  ])("has a rule set 1 hand tagged %s", (tag) => {
    expect(tags.has(tag)).toBe(true);
  });
  it("has at least 20 solo hands and a replayed tie in the duel", () => {
    expect(vectors.soloCases.length).toBeGreaterThanOrEqual(20);
    expect(vectors.duelCases.filter((m) => m.tags.includes("tie")).length).toBeGreaterThanOrEqual(3);
  });
});

describe("Blackjack totals", () => {
  it("counts an ace 11 only while it fits", () => {
    expect(blackjackTotal([0, 12])).toEqual({ total: 21, soft: true });
    expect(blackjackTotal([0, 6])).toEqual({ total: 18, soft: true });
    expect(blackjackTotal([0, 6, 9])).toEqual({ total: 18, soft: false });
    expect(blackjackTotal([0, 13, 26])).toEqual({ total: 13, soft: true });
    expect(blackjackTotal([0, 13, 26, 9])).toEqual({ total: 13, soft: false });
    expect(blackjackTotal([9, 10, 11])).toEqual({ total: 30, soft: false });
  });
});

describe("Blackjack scripts", () => {
  it("reads H S D P in any case and ignores separators", () => {
    expect(parseBlackjackScript("h s, d-p").moves).toEqual(["H", "S", "D", "P"]);
    expect(parseBlackjackScript("HSx").badChar).toBe("x");
    expect(parseBlackjackScript("").moves).toEqual([]);
  });
});

describe.each(vectors.soloCases)("Blackjack vector $clientSeed (rule set $rules.version, $policy, $tags)", (c) => {
  const seed = hexToBytes(c.serverSeed);
  const rules = rulesOf(c.rules);

  it("draws the floats and shuffles the shoe", async () => {
    const floats = await blackjackFloats(seed, c.clientSeed, c.nonce);
    expect(floats).toHaveLength(BLACKJACK.floatsPerHand);
    expect(floats[0].value).toBe(c.floatFirst);
    expect(floats[BLACKJACK.shuffleFloats - 1].value).toBe(c.floatLastShuffle);
    expect(floats[BLACKJACK.roundingFloatIndex].value).toBe(c.roundingFloat);
    expect(blackjackShoe(floats).join(" ")).toBe(c.shoe);
  });

  it("replays the hand: cards, results, dealer and what it returned", async () => {
    const floats = await blackjackFloats(seed, c.clientSeed, c.nonce);
    const round = blackjackRound(blackjackShoe(floats), rules, c.actions);
    expect(round.problem).toBeUndefined();
    expect(round.unfinished).toBe(false);
    expect(round.script).toBe(c.actions);
    expect(seatLooks(round)).toEqual(c.hands.map((h) => ({ cards: h.cards, stakes: h.stakes, doubled: h.doubled, fromSplit: h.fromSplit, splitAces: h.splitAces })));
    expect(round.results).toEqual(c.hands.map((h) => h.result));
    round.state.hands.forEach((h, i) => {
      expect(blackjackTotal(h.cards)).toEqual({ total: c.hands[i].total, soft: c.hands[i].soft });
    });
    expect(round.state.dealer).toEqual(c.dealer);
    expect(blackjackTotal(round.state.dealer).total).toBe(c.dealerTotal);
    expect(round.state.dealerNatural).toBe(c.dealerNatural);
    expect(round.stakes).toBe(c.stakesCommitted);
    expect(ratioDecimal(round.returned)).toBe(c.returnMultiple);
  });

  it("pays Stars on float 311 and Gram to the nanoton", async () => {
    const floats = await blackjackFloats(seed, c.clientSeed, c.nonce);
    const round = blackjackRound(blackjackShoe(floats), rules, c.actions);
    expect(vectors.stakes.map((b) => blackjackStarsPayout(b, round.returned, floats[BLACKJACK.roundingFloatIndex]))).toEqual(c.stars);
    expect(vectors.gramTiers.map((b) => blackjackGramPayout(b, round.returned))).toEqual(c.gram);
  });

  it("reads a script cut short as an unfinished hand, never as a result", async () => {
    const floats = await blackjackFloats(seed, c.clientSeed, c.nonce);
    if (c.actions.length === 0) return;
    const cut = blackjackRound(blackjackShoe(floats), rules, c.actions.slice(0, -1));
    expect(cut.unfinished).toBe(true);
    expect(cut.results).toEqual([]);
  });
});

describe("Blackjack refuses what the server refuses", () => {
  const find = (tag: string) => vectors.soloCases.find((c) => c.rules.version === 1 && c.tags.includes(tag))!;
  const shoeOf = async (c: (typeof vectors.soloCases)[number]) =>
    blackjackShoe(await blackjackFloats(hexToBytes(c.serverSeed), c.clientSeed, c.nonce));

  it("any move after the hand has ended", async () => {
    const c = find("splitAces");
    const after = blackjackRound(await shoeOf(c), BLACKJACK_V1, `${c.actions}H`);
    expect(after.problem).toEqual({ kind: "refused", index: c.actions.length + 1, move: "H", refusal: "HandOver" });
  });

  it("an unknown character, before replaying", async () => {
    const c = vectors.soloCases[0];
    expect(blackjackRound(await shoeOf(c), BLACKJACK_V1, "HX").problem).toEqual({ kind: "badChar", char: "X" });
  });

  it("a split of two cards of different value, and a double off hard 9 to 11", async () => {
    let sawPair = false;
    let sawMixed = false;
    let sawDoubleOut = false;
    for (const c of vectors.soloCases.filter((v) => v.rules.version === 1)) {
      const shoe = await shoeOf(c);
      const first = [shoe[0], shoe[1]];
      const state = blackjackRound(shoe, BLACKJACK_V1, "").state;
      if (state.settled) continue; // a blackjack or a dealer blackjack ends the hand on the deal
      const samePair = Math.min((first[0] % 13) + 1, 10) === Math.min((first[1] % 13) + 1, 10);
      const split = blackjackRound(shoe, BLACKJACK_V1, "P");
      if (samePair) {
        expect(split.problem === undefined || split.problem.kind !== "refused" || split.problem.refusal !== "NotAPair").toBe(true);
        sawPair = true;
      } else {
        expect(split.problem).toMatchObject({ kind: "refused", move: "P", refusal: "NotAPair" });
        sawMixed = true;
      }
      const { total, soft } = blackjackTotal(first);
      const dbl = blackjackRound(shoe, BLACKJACK_V1, "D");
      if (soft || total < 9 || total > 11) {
        expect(dbl.problem).toMatchObject({ kind: "refused", move: "D", refusal: "DoubleTotalNotAllowed" });
        sawDoubleOut = true;
      } else {
        expect(dbl.problem).toBeUndefined();
      }
    }
    expect(sawPair && sawMixed && sawDoubleOut).toBe(true);
  });

  it("a double after a split, and a second split", async () => {
    const c = find("splitHit");
    const shoe = await shoeOf(c);
    const splitAt = c.actions.indexOf("P");
    expect(splitAt).toBeGreaterThanOrEqual(0);
    const again = blackjackRound(shoe, BLACKJACK_V1, `${c.actions.slice(0, splitAt + 1)}P`);
    expect(again.problem).toMatchObject({ kind: "refused", move: "P" });
  });
});

describe.each(vectors.duelCases)("Blackjack Duel vector $clientSeed (hands $hands.length, $tags)", (m) => {
  const seed = hexToBytes(m.serverSeed);
  const inputs = m.hands.map((h) => ({ creator: h.creatorActions, opponent: h.opponentActions }));

  it("deals each hand's shoe at nonce base + hand", async () => {
    for (const h of m.hands) {
      const floats = await blackjackFloats(seed, m.clientSeed, m.nonce + h.hand);
      expect(h.nonce).toBe(m.nonce + h.hand);
      expect(blackjackShoe(floats).join(" ")).toBe(h.shoe);
    }
  });

  it("plays both seats against one dealer and scores on net stakes", async () => {
    const match = await blackjackDuelMatch(seed, m.clientSeed, m.nonce, inputs, BLACKJACK_V1);
    expect(match.problem).toBeUndefined();
    expect(match.hands).toHaveLength(m.hands.length);
    match.hands.forEach((h, i) => {
      const v = m.hands[i];
      expect(h.hand).toBe(v.hand);
      expect(h.creator.hands.map((x) => x.cards)).toEqual(v.creator.map((x) => x.cards));
      expect(h.opponent.hands.map((x) => x.cards)).toEqual(v.opponent.map((x) => x.cards));
      expect(h.creator.dealer).toEqual(v.dealer);
      expect(h.opponent.dealer).toEqual(v.dealer);
      expect(h.creator.dealerNatural).toBe(v.dealerNatural);
      expect(ratioDecimal({ num: h.creatorNet, den: h.netDen })).toBe(v.creatorNet);
      expect(ratioDecimal({ num: h.opponentNet, den: h.netDen })).toBe(v.opponentNet);
      expect(h.winner).toBe(v.winner);
    });
    expect(match.creatorWins).toBe(m.creatorWins);
    expect(match.opponentWins).toBe(m.opponentWins);
    expect(match.winner).toBe(m.winner);
  });

  it("rounds the pot on float 311 of the deciding hand", async () => {
    const match = await blackjackDuelMatch(seed, m.clientSeed, m.nonce, inputs, BLACKJACK_V1);
    const deciding = match.hands[match.hands.length - 1];
    expect(deciding.hand).toBe(m.roundingHand);
    expect(deciding.rounding.value).toBe(m.roundingFloat);
    expect(vectors.stakes.map((b) => pvpStarsPayout(b, deciding.rounding))).toEqual(m.stars);
  });

  it("ignores hands typed after the match was decided", async () => {
    const match = await blackjackDuelMatch(seed, m.clientSeed, m.nonce, [...inputs, { creator: "S", opponent: "S" }], BLACKJACK_V1);
    expect(match.hands).toHaveLength(m.hands.length);
    expect(match.unused).toBe(1);
  });

  it("starts at any hand number", async () => {
    const last = m.hands[m.hands.length - 1];
    const one = await blackjackDuelMatch(seed, m.clientSeed, m.nonce, [{ creator: last.creatorActions, opponent: last.opponentActions }], BLACKJACK_V1, last.hand);
    expect(one.problem).toBeUndefined();
    expect(one.hands[0].nonce).toBe(last.nonce);
    expect(one.hands[0].winner).toBe(last.winner);
  });

  it("stops on a seat whose script leaves a hand to play", async () => {
    const withStand = m.hands.find((h) => h.creatorActions.length > 0 && h.creatorActions.endsWith("S"));
    if (!withStand) return;
    const cut = { creator: withStand.creatorActions.slice(0, -1), opponent: withStand.opponentActions };
    const match = await blackjackDuelMatch(seed, m.clientSeed, m.nonce + withStand.hand - 1, [cut], BLACKJACK_V1);
    expect(match.problem).toMatchObject({ hand: 1, seat: "creator", kind: "unfinished" });
  });
});

describe("Blackjack Duel pot", () => {
  it("floors a Gram pot to the nanoton", () => {
    expect(vectors.gramTiers.map(pvpGramPayout)).toEqual(vectors.duelGram);
  });
  it("has hands typed as `creator/opponent`, separated by `;` or a line break", () => {
    expect(parseDuelHands("HS/D; S/HH\n/")).toEqual({
      hands: [{ creator: "HS", opponent: "D" }, { creator: "S", opponent: "HH" }, { creator: "", opponent: "" }],
    });
    expect(parseDuelHands("HS").badEntry).toBe(1);
    expect(parseDuelHands("").hands).toEqual([]);
  });
});

describe("Blackjack return as an exact ratio", () => {
  it("prints a ratio of tenths as a decimal", () => {
    expect(ratioDecimal(ratio("2.5"))).toBe("2.5");
    expect(ratioDecimal({ num: 0n, den: 10n })).toBe("0");
    expect(ratioDecimal({ num: -20n, den: 10n })).toBe("-2");
    expect(ratioDecimal({ num: 44n, den: 10n })).toBe("4.4");
  });
});
