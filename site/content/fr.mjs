// Texte français de la documentation du vérificateur. Même forme que en.mjs.

export default {
  siteName: "Vérificateur Provably fair de Gift Club",
  short: "Provably fair",

  ui: {
    navLabel: "Sections de la documentation",
    langsLabel: "Langues",
    footerBy: (brand) => `Open source par ${brand}, la Telegram Mini App avec des coffres de cadeaux et des jeux.`,
    moreLabel: "Plus de Gift Club",
    sourceOnGithub: "Code source sur GitHub",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Mis à jour",
    faqHeading: "Questions",
    relatedHeading: "À lire ensuite sur Gift Club",
  },

  nav: { home: "Aperçu", how: "Comment ça marche" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Roll Over",
    diceDuel: "Duel de dés", coinFlip: "Pile ou face", minefield: "Champ de mines", minesTower: "Tour des mines", balloonPump: "Gonfle-ballon",
    higherLower: "Plus ou moins", colorPredict: "Prédiction de couleur", rockPaperScissors: "Pierre-papier-ciseaux", magicDoor: "Porte magique",
    guessNumber: "Devine le nombre", match3: "Match-3", slots: "Machines à sous", roulette: "Roulette européenne", wheel: "Roue",
    crossing: "Traversée mécanique", blackjack: "Blackjack", pvpBlackjack: "Duel de Blackjack", pvpMinefield: "Champ de mines 1v1",
    pvpDiceDuel: "Dés 1v1", pvpBalloonPump: "Ballon 1v1", pvpLudo: "Duel de Ludo", pvpSeaWar: "Bataille navale", pvpDama: "Dama",
    pvpCheckers: "Dames",
  },

  home: {
    title: "Vérificateur Provably fair : code open source HMAC-SHA256 (npm)",
    description:
      "TypeScript open source qui recalcule chaque manche de Gift Club depuis server seed, client seed et nonce. CLI et bibliothèque npm, testées sur le serveur.",
    h1: "Vérificateur Provably fair",
    lead: "Vérifie n'importe quelle manche de Gift Club toi-même, sur ta propre machine, avec les mêmes maths que celles du serveur.",
    answer:
      "Une manche Provably fair, tout le monde peut la recalculer. Avant la manche, le serveur publie le <strong>hash SHA-256</strong> d'un server seed secret ; après, le seed lui-même. Ce paquet compare le seed au hash et retire la manche avec <strong>HMAC-SHA256</strong>, pour que tu voies que le résultat était fixé avant ta partie et n'a pas été modifié après.",
    stepsHeading: "Vérifie une manche en quatre étapes",
    steps: [
      "Dans les détails de la manche dans Gift Club, copie le <strong>hash du server seed</strong> affiché avant ta partie.",
      "Une fois le seed renouvelé, copie le <strong>server seed</strong> révélé, ton <strong>client seed</strong> et le <strong>nonce</strong> de la manche.",
      "Lance le vérificateur : il contrôle que le SHA-256 du seed est égal au hash, puis retire les nombres de la manche.",
      "Compare le résultat recalculé à celui de ton historique. Ils correspondent octet pour octet.",
    ],
    cliHeading: "En ligne de commande",
    cliText: "Avec npx, rien à installer. L'exemple ci-dessous est la manche de démonstration du paquet lui-même :",
    libHeading: "En bibliothèque",
    libText:
      "Le tirage propre à chaque jeu (où tombe la bille, quelles cartes sont distribuées, le point de Crash) est un espace de noms, par exemple <code>plinkoGold</code>, <code>crash</code> ou <code>collect</code>. Types TypeScript inclus.",
    gamesHeading: "Ce qu'il couvre",
    gamesIntro: "Tous les jeux de Gift Club qui tirent avec le moteur Provably fair, en Étoiles et en Gram :",
    duelsHeading: "Duels 1v1",
    collectHeading: "Coffres et cartes à gratter",
    collectText:
      "Les coffres et les cartes à gratter tirent dans une table de tickets fixe : le vérificateur recalcule quel ticket un tirage a choisi, y compris un tirage avec une cible définie.",
    browserText: (link) => `Tu préfères le navigateur ? Colle les mêmes valeurs dans ${link}.`,
    trustHeading: "Pourquoi tu peux te fier au code",
    trustText:
      "Chaque fonction reproduit une méthode du serveur octet pour octet, et les tests la rattachent à plus de 2 600 vecteurs entrée–sortie produits par le code du serveur lui-même. Si les maths du serveur changent, ces tests échouent jusqu'à ce que le vérificateur colle de nouveau.",
    faq: [
      {
        q: "Que veut dire Provably fair ?",
        a: "Que n'importe qui peut prouver que le résultat d'une manche était fixé avant la mise et n'a pas été modifié après. Le serveur s'engage sur un seed secret en publiant son hash, mélange un seed que tu contrôles, puis révèle le sien plus tard pour que tu puisses recalculer le résultat.",
      },
      {
        q: "Le serveur peut-il changer un résultat après ma partie ?",
        a: "Pas sans se faire prendre : un autre seed donne un autre hash SHA-256, et le hash t'a été montré avant la manche.",
      },
      {
        q: "Pourquoi mon client seed compte-t-il ?",
        a: "Le résultat dépend des deux seeds. Comme tu peux définir ton propre client seed, le serveur ne peut pas choisir un seed qui favorise un résultat connu d'avance.",
      },
      {
        q: "Le vérificateur a-t-il besoin d'internet ou d'un compte ?",
        a: "Non. Il tourne entièrement sur ta machine et n'a besoin que des quatre valeurs de la manche.",
      },
    ],
  },

  how: {
    title: "Comment fonctionne Provably fair : algorithme HMAC-SHA256",
    description:
      "L'algorithme Provably fair de Gift Club pas à pas : hash du seed, flux d'octets HMAC-SHA256, octets en floats, arrondi du gain, avec un exemple.",
    h1: "Comment fonctionne le tirage Provably fair",
    intro: "Tout l'algorithme, avec les nombres d'une vraie manche d'exemple déroulés pas à pas.",
    commitHeading: "1. L'engagement : un server seed haché",
    commitText:
      "Le serveur choisit un <strong>server seed</strong> aléatoire de 32 octets et ne te montre que son hash SHA-256. Le hash ne révèle rien du seed, mais il le fige : aucun autre seed n'a le même hash.",
    hmacHeading: "2. Le flux d'octets : HMAC-SHA256",
    hmacText:
      "Chaque manche utilise le server seed brut comme clé et <code>clientSeed:nonce:round</code> comme message. Le <strong>nonce</strong> compte tes manches sur cette paire de seeds ; <code>round</code> compte les blocs de 32 octets quand un jeu a besoin de plus de 32 octets.",
    floatHeading: "3. Des octets aux nombres",
    floatText:
      "Chaque groupe de quatre octets donne un float dans [0, 1). La formule est exacte : le vérificateur compare donc l'entier 32 bits sous-jacent, jamais une décimale arrondie.",
    mapHeading: "4. Des nombres à un résultat",
    mapText:
      "Chaque jeu transforme ses floats en résultat selon sa propre règle publiée : une suite de rebonds à gauche et à droite au Plinko, un paquet mélangé au Blackjack, un numéro de ticket dans un coffre. Les modules de jeu dans <code>src/games/</code> contiennent chaque règle et chaque table de gains.",
    roundingHeading: "5. Arrondi du gain",
    roundingText:
      "Un gain en Étoiles est un nombre entier. Quand mise × multiplicateur a une partie décimale, un float de plus décide s'il faut arrondir vers le haut, donc l'arrondi est lui aussi Provably fair. Les gains en Gram sont en revanche arrondis vers le bas au nanoton et ne tirent aucun float d'arrondi.",
    versionsHeading: "Versions des tables de gains",
    versionsText:
      "Quand une table de gains est réajustée, l'ancienne reste dans le code sous son numéro de version. Une manche est toujours vérifiée selon la version sur laquelle elle a été jouée, qu'indiquent les détails de la manche.",
    vectorsHeading: "Lance les tests toi-même",
    vectorsText: "La suite de tests rejoue des milliers de manches calculées par le serveur et vérifie chaque octet :",
    faq: [
      {
        q: "Pourquoi HMAC-SHA256 et pas un simple nombre aléatoire ?",
        a: "Parce qu'il est déterministe : les mêmes seeds et le même nonce donnent toujours les mêmes octets, donc un résultat peut être recalculé et vérifié. Un simple nombre aléatoire ne peut pas être vérifié après coup.",
      },
      {
        q: "Les mêmes seeds peuvent-ils produire deux résultats ?",
        a: "Non. Chaque manche utilise un nouveau nonce, donc deux manches sur une même paire de seeds ne partagent pas leurs octets.",
      },
      {
        q: "Où sont les règles des jeux ?",
        a: "Dans src/games/, un fichier par jeu, chacun avec les tables de gains que le serveur utilise.",
      },
    ],
  },
};
