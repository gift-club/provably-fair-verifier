// Testo italiano della documentazione del verificatore. Stessa forma di en.mjs.

export default {
  siteName: "Verificatore Provably fair di Gift Club",
  short: "Provably fair",

  ui: {
    navLabel: "Sezioni della documentazione",
    langsLabel: "Lingue",
    footerBy: (brand) => `Open source di ${brand}, la Telegram Mini App con casse di regali e giochi.`,
    moreLabel: "Altro da Gift Club",
    sourceOnGithub: "Codice su GitHub",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Aggiornato",
    faqHeading: "Domande",
    relatedHeading: "Continua a leggere su Gift Club",
  },

  nav: { home: "Panoramica", how: "Come funziona" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Supera il numero",
    diceDuel: "Duello di dadi", coinFlip: "Testa o croce", minefield: "Campo di mine", minesTower: "Torre delle mine", balloonPump: "Gonfia il palloncino",
    higherLower: "Più alto o più basso", colorPredict: "Indovina il colore", rockPaperScissors: "Carta, forbice, sasso", magicDoor: "Porta magica",
    guessNumber: "Indovina il numero", match3: "Tre in fila", slots: "Slot", roulette: "Roulette europea", wheel: "Ruota",
    crossing: "Traversata a molla", blackjack: "Blackjack", pvpBlackjack: "Duello di Blackjack", pvpMinefield: "Campo di mine 1v1",
    pvpDiceDuel: "Dadi 1v1", pvpBalloonPump: "Palloncino 1v1", pvpLudo: "Duello a Ludo", pvpSeaWar: "Battaglia navale", pvpDama: "Dama turca",
    pvpCheckers: "Dama",
  },

  home: {
    title: "Verificatore Provably fair: codice open source HMAC-SHA256 (npm)",
    description:
      "TypeScript open source che ricalcola ogni round di Gift Club da server seed, client seed e nonce. CLI e libreria npm, testate sugli output del server stesso.",
    h1: "Verificatore Provably fair",
    lead: "Controlla qualsiasi round di Gift Club in autonomia, sul tuo computer, con la stessa matematica che ha eseguito il server.",
    answer:
      "Un round Provably fair può essere ricalcolato da chiunque. Prima del round il server pubblica l'<strong>hash SHA-256</strong> di un server seed segreto; dopo, il seed stesso. Questo pacchetto confronta il seed con l'hash e rigenera il round con <strong>HMAC-SHA256</strong>, così vedi che il risultato era fissato prima che giocassi e non è stato cambiato dopo.",
    stepsHeading: "Verifica un round in quattro passi",
    steps: [
      "Nei dettagli del round in Gift Club, copia l'<strong>hash del server seed</strong> mostrato prima di giocare.",
      "Dopo la rotazione del seed, copia il <strong>server seed</strong> rivelato, il tuo <strong>client seed</strong> e il <strong>nonce</strong> del round.",
      "Esegui il verificatore: controlla che lo SHA-256 del seed sia uguale all'hash, poi rigenera i numeri del round.",
      "Confronta il risultato rigenerato con quello nella tua cronologia. Coincidono byte per byte.",
    ],
    cliHeading: "Dalla riga di comando",
    cliText: "Con npx non serve installare nulla. L'esempio qui sotto è il round dimostrativo del pacchetto stesso:",
    libHeading: "Come libreria",
    libText:
      "L'estrazione di ogni gioco (dove cade la pallina, quali carte vengono date, il punto di Crash) è un namespace, per esempio <code>plinkoGold</code>, <code>crash</code> o <code>collect</code>. Tipi TypeScript inclusi.",
    gamesHeading: "Cosa copre",
    gamesIntro: "Tutti i giochi di Gift Club che estraggono con il motore Provably fair, in Stelle e in Gram:",
    duelsHeading: "Duelli 1v1",
    collectHeading: "Casse e gratta e vinci",
    collectText:
      "Le casse e i gratta e vinci estraggono da una tabella fissa di biglietti: il verificatore ricalcola quale biglietto ha scelto un'estrazione, anche con un obiettivo impostato.",
    browserText: (link) => `Preferisci il browser? Incolla gli stessi valori in ${link}.`,
    trustHeading: "Perché puoi fidarti del codice",
    trustText:
      "Ogni funzione replica un metodo del server byte per byte, e i test la legano a più di 2.600 vettori di input e output prodotti dal codice del server stesso. Se la matematica del server cambia, questi test falliscono finché il verificatore non torna a coincidere.",
    faq: [
      {
        q: "Cosa significa Provably fair?",
        a: "Che chiunque può dimostrare che il risultato di un round era fissato prima della puntata e non è stato cambiato dopo. Il server si impegna su un seed segreto pubblicandone l'hash, mescola un seed che controlli tu e rivela il proprio più tardi, così puoi ricalcolare il risultato.",
      },
      {
        q: "Il server può cambiare un risultato dopo che ho giocato?",
        a: "Non senza essere scoperto: un seed diverso dà un hash SHA-256 diverso, e l'hash ti è stato mostrato prima del round.",
      },
      {
        q: "Perché il mio client seed conta?",
        a: "Il risultato dipende da entrambi i seed. Dato che puoi impostare tu il tuo client seed, il server non può scegliere un seed che favorisca un esito già noto.",
      },
      {
        q: "Il verificatore ha bisogno di internet o di un account?",
        a: "No. Funziona interamente sul tuo computer e servono solo i quattro valori del round.",
      },
    ],
  },

  how: {
    title: "Come funziona Provably fair: algoritmo HMAC-SHA256 passo passo",
    description:
      "Algoritmo Provably fair di Gift Club passo passo: hash del seed, flusso di byte HMAC-SHA256, da byte a float e arrotondamento, con esempio.",
    h1: "Come funziona l'estrazione Provably fair",
    intro: "L'intero algoritmo, con i numeri di un round reale svolti passo passo.",
    commitHeading: "1. L'impegno: un server seed con hash",
    commitText:
      "Il server sceglie un <strong>server seed</strong> casuale di 32 byte e ti mostra solo il suo hash SHA-256. L'hash non rivela nulla del seed, ma lo fissa: nessun altro seed ha lo stesso hash.",
    hmacHeading: "2. Il flusso di byte: HMAC-SHA256",
    hmacText:
      "Ogni round usa come chiave il server seed grezzo e come messaggio <code>clientSeed:nonce:round</code>. Il <strong>nonce</strong> conta i tuoi round su questa coppia di seed; <code>round</code> conta i blocchi da 32 byte quando un gioco ha bisogno di più di 32 byte.",
    floatHeading: "3. Dai byte ai numeri",
    floatText:
      "Ogni quattro byte formano un float in [0, 1). La formula è esatta, quindi il verificatore confronta l'intero a 32 bit sottostante, mai un decimale arrotondato.",
    mapHeading: "4. Dai numeri a un risultato",
    mapText:
      "Ogni gioco trasforma i suoi float in un esito con una regola propria e pubblicata: una fila di rimbalzi a sinistra e a destra in Plinko, un mazzo mescolato nel Blackjack, un numero di biglietto in una cassa. I moduli dei giochi in <code>src/games/</code> contengono ogni regola e ogni tabella dei pagamenti.",
    roundingHeading: "5. Arrotondamento della vincita",
    roundingText:
      "Una vincita in Stelle è un numero intero. Quando puntata × moltiplicatore ha una parte frazionaria, un altro float decide se arrotondare per eccesso, quindi anche l'arrotondamento è Provably fair. I pagamenti in Gram, invece, sono arrotondati per difetto al nanoton e non estraggono nessun float di arrotondamento.",
    versionsHeading: "Versioni della tabella dei pagamenti",
    versionsText:
      "Quando una tabella dei pagamenti viene ritarata, quella vecchia resta nel codice con il suo numero di versione. Un round viene sempre verificato con la versione su cui è stato giocato, indicata nei dettagli del round.",
    vectorsHeading: "Esegui i test in autonomia",
    vectorsText: "La suite di test riproduce migliaia di round calcolati dal server e controlla ogni byte:",
    faq: [
      {
        q: "Perché HMAC-SHA256 e non un semplice numero casuale?",
        a: "Perché è deterministico: gli stessi seed e lo stesso nonce danno sempre gli stessi byte, quindi un risultato si può ricalcolare e controllare. Un semplice numero casuale non si può controllare a posteriori.",
      },
      {
        q: "Gli stessi seed possono produrre due risultati?",
        a: "No. Ogni round usa un nonce nuovo, quindi due round sulla stessa coppia di seed non condividono i loro byte.",
      },
      {
        q: "Dove sono le regole dei giochi?",
        a: "In src/games/, un file per gioco, ognuno con le tabelle dei pagamenti che usa il server.",
      },
    ],
  },
};
