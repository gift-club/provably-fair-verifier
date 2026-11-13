# Gift Club provably fair verifier

Check any [Gift Club](https://giftclub.app/) round yourself. Open-source TypeScript that re-computes every provably fair draw from its **server seed**, **client seed** and **nonce** with HMAC-SHA256, exactly as the server ran it.

**Docs:** https://gift-club.github.io/provably-fair-verifier/ · [How it works](https://gift-club.github.io/provably-fair-verifier/how-it-works/)

```bash
npx @gift-club/provably-fair-verifier <serverSeed> <serverSeedHash> <clientSeed> <nonce> [count]
```

```text
$ npx @gift-club/provably-fair-verifier \
    0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff0 \
    afa880ca0c7da502fc32ab284cf70852ef7c5540204e4215c2a1617074ca7905 \
    gift-club-demo 0 2
SHA-256(server seed) = afa880ca0c7da502fc32ab284cf70852ef7c5540204e4215c2a1617074ca7905
✔ matches the hash published before the round
float 0: 0.1044411135  (uint32 448571167)
float 1: 0.1064818364  (uint32 457336005)
```

## How a round is checked

1. Before the round, the server shows the **SHA-256 hash** of a secret 32-byte server seed. The hash pins the seed: no other seed has it.
2. The round draws its bytes from `HMAC-SHA256(serverSeed, "clientSeed:nonce:round")`. You control the client seed; the nonce counts your rounds; `round` counts 32-byte blocks.
3. Every four bytes make one float: `b0/256 + b1/256² + b2/256³ + b3/256⁴`, in [0, 1).
4. Each game turns its floats into an outcome by its own rule and pay table, in [`src/games/`](src/games).
5. After the seed rotates, the server reveals it. Hash it, re-draw, and compare with your history.

## As a library

```bash
npm install @gift-club/provably-fair-verifier
```

```ts
import { generateFloats, hexToBytes, sha256Hex, crash, plinkoGold, collect } from "@gift-club/provably-fair-verifier";

const seed = hexToBytes(serverSeed);
console.log((await sha256Hex(seed)) === serverSeedHash); // true: the seed was fixed before the round
const floats = await generateFloats(seed, clientSeed, nonce, 4);
```

Each game is a namespace (`crash`, `plinkoGold`, `slots`, `roulette`, `blackjack`, `collect`, `pvpSeaBattle`…) with the server's rules, pay tables and pay-table versions.

**Covered:** Crash, Plinko, Plinko Gold, Pachinko, Keno, Roll Over, Dice Duel, Coin Flip, Minefield, Mines Tower, Balloon Pump, Higher/Lower, Color Prediction, Rock Paper Scissors, Magic Door, Guess Number, Match-3, Slots, European Roulette, Wheel, Wind-up Crossing, Blackjack; the 1v1 duels (Blackjack Duel, Minefield 1v1, Dice 1v1, Balloon 1v1, Ludo Duel, Sea Battle, Dama, Checkers); and the ticket tables of boxes and scratch cards. Stars and Gram rounds both.

## Why trust it

Every function mirrors a server method byte for byte, and the suite pins it to 2,600+ input/output vectors produced by the server's own code:

```bash
npm install
npm test     # vitest: 17 files, 2,615 tests
npm run build
```

Prefer the browser? The same checks run in the [Provably fair checker](https://giftclub.app/tools/provably-fair-checker) on giftclub.app.

## Licence

MIT. Made by [Gift Club](https://giftclub.app/), the Telegram Mini App with gift boxes and games. More: [Telegram Gifts & Stars Dataset](https://github.com/gift-club/telegram-gifts-dataset) · [Telegram Stars calculator](https://github.com/gift-club/telegram-stars-calculator)
