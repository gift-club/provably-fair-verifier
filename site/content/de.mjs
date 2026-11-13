// Deutscher Text der Verifier-Dokumentation. Gleiche Form wie en.mjs.

export default {
  siteName: "Gift Club Provably-fair-Verifier",
  short: "Provably fair",

  ui: {
    navLabel: "Abschnitte der Dokumentation",
    langsLabel: "Sprachen",
    footerBy: (brand) => `Open Source von ${brand}, der Telegram Mini App mit Geschenk-Boxen und Spielen.`,
    moreLabel: "Mehr von Gift Club",
    sourceOnGithub: "Quellcode auf GitHub",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Aktualisiert",
    faqHeading: "Fragen",
    relatedHeading: "Weiterlesen bei Gift Club",
  },

  nav: { home: "Überblick", how: "So funktioniert es" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Roll Over",
    diceDuel: "Würfelduell", coinFlip: "Münzwurf", minefield: "Minenfeld", minesTower: "Minenturm", balloonPump: "Ballonpumpe",
    higherLower: "Höher/Tiefer", colorPredict: "Farbvorhersage", rockPaperScissors: "Schere, Stein, Papier", magicDoor: "Magische Tür",
    guessNumber: "Zahlenraten", match3: "Match-3", slots: "Slots", roulette: "Europäisches Roulette", wheel: "Glücksrad",
    crossing: "Aufzieh-Überweg", blackjack: "Blackjack", pvpBlackjack: "Blackjack-Duell", pvpMinefield: "Minenfeld 1v1",
    pvpDiceDuel: "Würfel 1v1", pvpBalloonPump: "Ballon 1v1", pvpLudo: "Ludo-Duell", pvpSeaWar: "Schiffe versenken", pvpDama: "Dama",
    pvpCheckers: "Dame",
  },

  home: {
    title: "Provably-fair-Verifier: Open-Source-Code mit HMAC-SHA256 (npm)",
    description:
      "Open-Source-TypeScript berechnet jede Gift-Club-Runde aus Server Seed, Client Seed und Nonce neu. CLI und npm-Bibliothek, gegen den Server getestet.",
    h1: "Provably-fair-Verifier",
    lead: "Prüfe jede Gift-Club-Runde selbst, auf deinem eigenen Rechner, mit derselben Mathematik, die der Server ausgeführt hat.",
    answer:
      "Eine Provably-fair-Runde kann jeder neu berechnen. Vor der Runde veröffentlicht der Server den <strong>SHA-256-Hash</strong> eines geheimen Server Seeds, danach den Seed selbst. Dieses Paket gleicht den Seed mit dem Hash ab und zieht die Runde mit <strong>HMAC-SHA256</strong> neu, sodass du siehst: Das Ergebnis stand fest, bevor du gespielt hast, und wurde danach nicht geändert.",
    stepsHeading: "Eine Runde in vier Schritten prüfen",
    steps: [
      "Kopiere in den Rundendetails in Gift Club den <strong>Server-Seed-Hash</strong>, der vor deinem Spiel angezeigt wurde.",
      "Kopiere nach dem Seed-Wechsel den offengelegten <strong>Server Seed</strong>, deinen <strong>Client Seed</strong> und den <strong>Nonce</strong> der Runde.",
      "Starte den Verifier: Er prüft, ob der SHA-256 des Seeds dem Hash entspricht, und zieht dann die Zahlen der Runde neu.",
      "Vergleiche das neu gezogene Ergebnis mit dem in deinem Verlauf. Sie stimmen Byte für Byte überein.",
    ],
    cliHeading: "Über die Kommandozeile",
    cliText: "Mit npx musst du nichts installieren. Das Beispiel unten ist die Demo-Runde des Pakets selbst:",
    libHeading: "Als Bibliothek",
    libText:
      "Die Ziehung jedes Spiels (wo die Kugel landet, welche Karten ausgeteilt werden, der Crash-Punkt) ist ein Namespace, z. B. <code>plinkoGold</code>, <code>crash</code> oder <code>collect</code>. TypeScript-Typen sind enthalten.",
    gamesHeading: "Was er abdeckt",
    gamesIntro: "Alle Gift-Club-Spiele, die mit der Provably-fair-Engine ziehen, in Sternen und in Gram:",
    duelsHeading: "1v1-Duelle",
    collectHeading: "Boxen und Rubbelkarten",
    collectText:
      "Boxen und Rubbelkarten ziehen aus einer festen Ticket-Tabelle: Der Verifier berechnet neu, welches Ticket eine Ziehung gewählt hat, auch bei einer Ziehung mit gesetztem Ziel.",
    browserText: (link) => `Lieber im Browser? Füge dieselben Werte in ${link} ein.`,
    trustHeading: "Warum du dem Code vertrauen kannst",
    trustText:
      "Jede Funktion bildet eine Server-Methode Byte für Byte nach, und die Tests binden sie an mehr als 2.600 Eingabe-Ausgabe-Vektoren, die der Servercode selbst erzeugt hat. Ändert sich die Mathematik des Servers, schlagen diese Tests fehl, bis der Verifier wieder passt.",
    faq: [
      {
        q: "Was bedeutet Provably fair?",
        a: "Dass jeder beweisen kann, dass das Ergebnis einer Runde vor dem Einsatz feststand und danach nicht geändert wurde. Der Server legt sich auf einen geheimen Seed fest, indem er dessen Hash veröffentlicht, mischt einen Seed ein, den du bestimmst, und legt seinen Seed später offen, damit du das Ergebnis neu berechnen kannst.",
      },
      {
        q: "Kann der Server ein Ergebnis ändern, nachdem ich gespielt habe?",
        a: "Nicht, ohne erwischt zu werden: Ein anderer Seed ergibt einen anderen SHA-256-Hash, und den Hash hat man dir vor der Runde gezeigt.",
      },
      {
        q: "Warum ist mein Client Seed wichtig?",
        a: "Das Ergebnis hängt von beiden Seeds ab. Weil du deinen Client Seed selbst setzen kannst, kann der Server keinen Seed wählen, der ein bekanntes Ergebnis begünstigt.",
      },
      {
        q: "Braucht der Verifier eine Internetverbindung oder ein Konto?",
        a: "Nein. Er läuft komplett auf deinem Rechner und braucht nur die vier Werte der Runde.",
      },
    ],
  },

  how: {
    title: "So funktioniert Provably fair: HMAC-SHA256-Algorithmus erklärt",
    description:
      "Der Provably-fair-Algorithmus von Gift Club Schritt für Schritt: Seed-Hash, HMAC-SHA256-Bytestrom, Bytes zu Floats, Auszahlungsrundung, mit Beispiel.",
    h1: "So funktioniert die Provably-fair-Ziehung",
    intro: "Der ganze Algorithmus, mit den Zahlen einer echten Beispielrunde durchgerechnet.",
    commitHeading: "1. Die Festlegung: ein gehashter Server Seed",
    commitText:
      "Der Server wählt einen zufälligen 32-Byte-<strong>Server Seed</strong> und zeigt dir nur dessen SHA-256-Hash. Der Hash verrät nichts über den Seed, legt ihn aber fest: Kein anderer Seed hat denselben Hash.",
    hmacHeading: "2. Der Bytestrom: HMAC-SHA256",
    hmacText:
      "Jede Runde nutzt den rohen Server Seed als Schlüssel und <code>clientSeed:nonce:round</code> als Nachricht. Der <strong>Nonce</strong> zählt deine Runden mit diesem Seed-Paar; <code>round</code> zählt 32-Byte-Blöcke, wenn ein Spiel mehr als 32 Bytes braucht.",
    floatHeading: "3. Von Bytes zu Zahlen",
    floatText:
      "Je vier Bytes ergeben einen Float in [0, 1). Die Formel ist exakt, deshalb vergleicht der Verifier die zugrunde liegende 32-Bit-Ganzzahl, nie eine gerundete Dezimalzahl.",
    mapHeading: "4. Von Zahlen zu einem Ergebnis",
    mapText:
      "Jedes Spiel macht aus seinen Floats ein Ergebnis nach einer eigenen veröffentlichten Regel: eine Reihe von Links-rechts-Abprallern bei Plinko, ein gemischtes Deck bei Blackjack, eine Ticketnummer in einer Box. Die Spielmodule in <code>src/games/</code> enthalten jede Regel und jede Auszahlungstabelle.",
    roundingHeading: "5. Auszahlungsrundung",
    roundingText:
      "Ein Gewinn in Sternen ist eine ganze Zahl. Hat Einsatz × Multiplikator einen Nachkommaanteil, entscheidet ein weiterer Float, ob aufgerundet wird, sodass auch die Rundung Provably fair ist. Gram-Auszahlungen werden stattdessen auf den Nanoton abgerundet und ziehen keinen Rundungs-Float.",
    versionsHeading: "Versionen der Auszahlungstabelle",
    versionsText:
      "Wird eine Auszahlungstabelle neu abgestimmt, bleibt die alte unter ihrer Versionsnummer im Code. Eine Runde wird immer gegen die Version geprüft, auf der sie gespielt wurde; sie steht in den Rundendetails.",
    vectorsHeading: "Die Tests selbst ausführen",
    vectorsText: "Die Testsuite spielt Tausende vom Server berechnete Runden nach und prüft jedes Byte:",
    faq: [
      {
        q: "Warum HMAC-SHA256 und keine normale Zufallszahl?",
        a: "Weil es deterministisch ist: Dieselben Seeds und derselbe Nonce ergeben immer dieselben Bytes, deshalb lässt sich ein Ergebnis neu berechnen und prüfen. Eine normale Zufallszahl lässt sich im Nachhinein nicht prüfen.",
      },
      {
        q: "Können dieselben Seeds zwei Ergebnisse erzeugen?",
        a: "Nein. Jede Runde nutzt einen neuen Nonce, daher teilen zwei Runden auf einem Seed-Paar nie ihre Bytes.",
      },
      {
        q: "Wo stehen die Spielregeln?",
        a: "In src/games/, eine Datei pro Spiel, jede mit den Auszahlungstabellen, die der Server nutzt.",
      },
    ],
  },
};
