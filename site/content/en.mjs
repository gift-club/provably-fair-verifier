// English copy for the verifier docs. Every other language file has the same shape.
// No odds, win chances or return figures anywhere: the page explains how a draw is checked, never what it pays.

export default {
  siteName: "Gift Club provably fair verifier",
  short: "Provably fair",

  ui: {
    navLabel: "Docs sections",
    langsLabel: "Languages",
    footerBy: (brand) => `Open source by ${brand}, the Telegram Mini App with gift boxes and games.`,
    moreLabel: "More from Gift Club",
    sourceOnGithub: "Source on GitHub",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Updated",
    faqHeading: "Questions",
    relatedHeading: "Read next on Gift Club",
  },

  nav: { home: "Overview", how: "How it works" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Roll Over",
    diceDuel: "Dice Duel", coinFlip: "Coin Flip", minefield: "Minefield", minesTower: "Mines Tower", balloonPump: "Balloon Pump",
    higherLower: "Higher/Lower", colorPredict: "Color Prediction", rockPaperScissors: "Rock Paper Scissors", magicDoor: "Magic Door",
    guessNumber: "Guess Number", match3: "Match-3", slots: "Slots", roulette: "European Roulette", wheel: "Wheel",
    crossing: "Wind-up Crossing", blackjack: "Blackjack", pvpBlackjack: "Blackjack Duel", pvpMinefield: "Minefield 1v1",
    pvpDiceDuel: "Dice 1v1", pvpBalloonPump: "Balloon 1v1", pvpLudo: "Ludo Duel", pvpSeaWar: "Sea Battle", pvpDama: "Dama",
    pvpCheckers: "Checkers",
  },

  home: {
    title: "Provably Fair Verifier: Open-Source HMAC-SHA256 Code (npm)",
    description:
      "Open-source TypeScript that re-computes every Gift Club round from its server seed, client seed and nonce. CLI and npm library, tested against the server's own outputs.",
    h1: "Provably fair verifier",
    lead: "Check any Gift Club round yourself, on your own machine, with the same maths the server ran.",
    answer:
      "A provably fair round can be re-computed by anyone. Before the round the server publishes the <strong>SHA-256 hash</strong> of a secret server seed; after it, the seed itself. This package checks the seed against the hash and re-draws the round with <strong>HMAC-SHA256</strong>, so you can see that the result was fixed before you played and was not changed after.",
    stepsHeading: "Verify a round in four steps",
    steps: [
      "In the round's details in Gift Club, copy the <strong>server seed hash</strong> shown before you played.",
      "After the seed rotates, copy the revealed <strong>server seed</strong>, your <strong>client seed</strong> and the round's <strong>nonce</strong>.",
      "Run the verifier: it checks that SHA-256 of the seed equals the hash, then re-draws the round's numbers.",
      "Compare the re-drawn result with the one in your history. They match byte for byte.",
    ],
    cliHeading: "From the command line",
    cliText: "No install needed with npx. The example below is the package's own demo round:",
    libHeading: "As a library",
    libText:
      "Each game's own draw (where the ball lands, which cards are dealt, the crash point) is a namespace, e.g. <code>plinkoGold</code>, <code>crash</code> or <code>collect</code>. TypeScript types included.",
    gamesHeading: "What it covers",
    gamesIntro: "Every Gift Club game that draws with the provably fair engine, in Stars and in Gram:",
    duelsHeading: "1v1 duels",
    collectHeading: "Boxes and scratch cards",
    collectText:
      "Boxes and scratch cards draw from a fixed ticket table: the verifier re-computes which ticket a draw picked, including a draw with a target set.",
    browserText: (link) => `Prefer the browser? Paste the same values into the ${link}.`,
    trustHeading: "Why you can trust the code",
    trustText:
      "Every function mirrors a server method byte for byte, and the tests pin it to more than 2,600 input–output vectors produced by the server's own code. If the server's maths ever changes, these tests fail until the verifier matches again.",
    faq: [
      {
        q: "What does provably fair mean?",
        a: "That anyone can prove a round's result was fixed before the bet and not changed after. The server commits to a secret seed by publishing its hash, mixes in a seed you control, and reveals its seed later so you can re-compute the result.",
      },
      {
        q: "Can the server change a result after I play?",
        a: "Not without being caught: a different seed gives a different SHA-256 hash, and the hash was shown to you before the round.",
      },
      {
        q: "Why does my client seed matter?",
        a: "The result depends on both seeds. Since you can set your own client seed, the server cannot pick a seed that favours a known outcome for you.",
      },
      {
        q: "Does the verifier need an internet connection or an account?",
        a: "No. It runs entirely on your machine and needs only the four values from the round.",
      },
    ],
  },

  how: {
    title: "How Provably Fair Works: HMAC-SHA256 Algorithm, Step by Step",
    description:
      "The provably fair algorithm behind Gift Club, step by step: seed hash commitment, HMAC-SHA256 byte stream, bytes to floats, payout rounding, with a worked example.",
    h1: "How the provably fair draw works",
    intro: "The whole algorithm, with the numbers of one real example round worked through.",
    commitHeading: "1. The commitment: a hashed server seed",
    commitText:
      "The server picks a random 32-byte <strong>server seed</strong> and shows you only its SHA-256 hash. The hash reveals nothing about the seed, but it pins it: no other seed has the same hash.",
    hmacHeading: "2. The byte stream: HMAC-SHA256",
    hmacText:
      "Each round is keyed by the raw server seed and the message <code>clientSeed:nonce:round</code>. The <strong>nonce</strong> counts your rounds on this seed pair; <code>round</code> counts 32-byte blocks when a game needs more than 32 bytes.",
    floatHeading: "3. From bytes to numbers",
    floatText:
      "Every four bytes make one float in [0, 1). The formula is exact, so the verifier compares the underlying 32-bit integer, never a rounded decimal.",
    mapHeading: "4. From numbers to a result",
    mapText:
      "Each game turns its floats into an outcome by its own published rule: a row of left/right bounces in Plinko, a shuffled deck in Blackjack, a ticket number in a box. The game modules in <code>src/games/</code> hold each rule and each pay table.",
    roundingHeading: "5. Payout rounding",
    roundingText:
      "A win in Stars is a whole number. When bet × multiplier has a fraction, one more float decides whether it rounds up, so the rounding is provably fair too. Gram payouts are floored to the nanoton instead and draw no rounding float.",
    versionsHeading: "Pay table versions",
    versionsText:
      "When a pay table is retuned, the old one stays in the code under its version number. A round is always checked against the version it was played on, which the round's details show.",
    vectorsHeading: "Run the tests yourself",
    vectorsText: "The test suite replays thousands of rounds the server computed and checks every byte:",
    faq: [
      {
        q: "Why HMAC-SHA256 and not a plain random number?",
        a: "Because it is deterministic: the same seeds and nonce always give the same bytes, so a result can be re-computed and checked. A plain random number cannot be checked after the fact.",
      },
      {
        q: "Can the same seeds produce two results?",
        a: "No. Every round uses a new nonce, so no two rounds on one seed pair share their bytes.",
      },
      {
        q: "Where are the game rules?",
        a: "In src/games/, one file per game, each with the pay tables the server uses.",
      },
    ],
  },
};
