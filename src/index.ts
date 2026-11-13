/**
 * Gift Club provably fair verifier.
 *
 * Core: the HMAC-SHA256 byte stream, the floats drawn from it, the seed hash check and the payout
 * rounding, exactly as Gift Club's server computes them. Each game's own draw is a namespace below.
 */
export * from "./provablyFair.js";

export * as blackjack from "./games/blackjack.js";
export * as blackjackDuel from "./games/blackjack-duel.js";
export * as coinFlip from "./games/coin-flip.js";
export * as collect from "./games/collect.js";
export * as colorPredict from "./games/color-predict.js";
export * as crash from "./games/crash.js";
export * as crossing from "./games/crossing.js";
export * as guessNumber from "./games/guess-number.js";
export * as magicDoor from "./games/magic-door.js";
export * as match3 from "./games/match3.js";
export * as pachinko from "./games/pachinko.js";
export * as plinkoGold from "./games/plinko-gold.js";
export * as pvpBalloonPump from "./games/pvp-balloon-pump.js";
export * as pvpDama from "./games/pvp-dama.js";
export * as pvpDiceDuel from "./games/pvp-dice-duel.js";
export * as pvpLudo from "./games/pvp-ludo.js";
export * as pvpMinefield from "./games/pvp-minefield.js";
export * as pvpPot from "./games/pvp-pot.js";
export * as pvpSeaBattle from "./games/pvp-sea-battle.js";
export * as rockPaperScissors from "./games/rock-paper-scissors.js";
export * as roulette from "./games/roulette.js";
export * as slots from "./games/slots.js";
export * as wheel from "./games/wheel.js";
