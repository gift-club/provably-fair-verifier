// Texto en español de la documentación del verificador. Misma forma que en.mjs.

export default {
  siteName: "Verificador Provably fair de Gift Club",
  short: "Provably fair",

  ui: {
    navLabel: "Secciones de la documentación",
    langsLabel: "Idiomas",
    footerBy: (brand) => `Código abierto de ${brand}, la Telegram Mini App con cajas de regalos y juegos.`,
    moreLabel: "Más de Gift Club",
    sourceOnGithub: "Código en GitHub",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Actualizado",
    faqHeading: "Preguntas",
    relatedHeading: "Sigue leyendo en Gift Club",
  },

  nav: { home: "Resumen", how: "Cómo funciona" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Supera el número",
    diceDuel: "Duelo de dados", coinFlip: "Cara o cruz", minefield: "Campo minado", minesTower: "Torre de minas", balloonPump: "Infla el globo",
    higherLower: "Mayor o menor", colorPredict: "Adivina el color", rockPaperScissors: "Piedra, papel o tijera", magicDoor: "Puerta mágica",
    guessNumber: "Adivina el número", match3: "Combina 3", slots: "Tragamonedas", roulette: "Ruleta europea", wheel: "Rueda",
    crossing: "Cruce de cuerda", blackjack: "Blackjack", pvpBlackjack: "Duelo de Blackjack", pvpMinefield: "Campo minado 1v1",
    pvpDiceDuel: "Dados 1v1", pvpBalloonPump: "Globo 1v1", pvpLudo: "Duelo de Ludo", pvpSeaWar: "Batalla naval", pvpDama: "Dama turca",
    pvpCheckers: "Damas",
  },

  home: {
    title: "Verificador Provably fair: código abierto HMAC-SHA256 (npm)",
    description:
      "Código abierto en TypeScript que recalcula cada ronda de Gift Club desde server seed, client seed y nonce. CLI y librería npm, probadas con el servidor.",
    h1: "Verificador Provably fair",
    lead: "Comprueba cualquier ronda de Gift Club por tu cuenta, en tu propio equipo, con las mismas matemáticas que ejecutó el servidor.",
    answer:
      "Una ronda Provably fair puede recalcularla cualquiera. Antes de la ronda el servidor publica el <strong>hash SHA-256</strong> de un server seed secreto; después, el propio seed. Este paquete comprueba el seed contra el hash y vuelve a sortear la ronda con <strong>HMAC-SHA256</strong>, así que ves que el resultado quedó fijado antes de que jugaras y no se cambió después.",
    stepsHeading: "Verifica una ronda en cuatro pasos",
    steps: [
      "En los detalles de la ronda en Gift Club, copia el <strong>hash del server seed</strong> que se mostró antes de jugar.",
      "Cuando el seed rota, copia el <strong>server seed</strong> revelado, tu <strong>client seed</strong> y el <strong>nonce</strong> de la ronda.",
      "Ejecuta el verificador: comprueba que el SHA-256 del seed coincide con el hash y vuelve a sortear los números de la ronda.",
      "Compara el resultado recalculado con el de tu historial. Coinciden byte a byte.",
    ],
    cliHeading: "Desde la línea de comandos",
    cliText: "Con npx no hace falta instalar nada. El ejemplo de abajo es la ronda de demostración del propio paquete:",
    libHeading: "Como librería",
    libText:
      "El sorteo de cada juego (dónde cae la bola, qué cartas se reparten, el punto de Crash) es un espacio de nombres, por ejemplo <code>plinkoGold</code>, <code>crash</code> o <code>collect</code>. Incluye tipos de TypeScript.",
    gamesHeading: "Qué cubre",
    gamesIntro: "Todos los juegos de Gift Club que sortean con el motor Provably fair, en Estrellas y en Gram:",
    duelsHeading: "Duelos 1v1",
    collectHeading: "Cajas y rasca y gana",
    collectText:
      "Las cajas y los rasca y gana sortean de una tabla fija de boletos: el verificador recalcula qué boleto eligió un sorteo, incluido un sorteo con objetivo fijado.",
    browserText: (link) => `¿Prefieres el navegador? Pega los mismos valores en ${link}.`,
    trustHeading: "Por qué puedes fiarte del código",
    trustText:
      "Cada función replica un método del servidor byte a byte, y las pruebas la fijan a más de 2600 vectores de entrada y salida generados por el código del propio servidor. Si las matemáticas del servidor cambian, esas pruebas fallan hasta que el verificador vuelva a coincidir.",
    faq: [
      {
        q: "¿Qué significa Provably fair?",
        a: "Que cualquiera puede demostrar que el resultado de una ronda quedó fijado antes de la apuesta y no se cambió después. El servidor se compromete con un seed secreto publicando su hash, mezcla un seed que controlas tú y revela el suyo más tarde para que puedas recalcular el resultado.",
      },
      {
        q: "¿Puede el servidor cambiar un resultado después de que juegue?",
        a: "No sin que lo pillen: otro seed da otro hash SHA-256, y el hash te lo mostraron antes de la ronda.",
      },
      {
        q: "¿Por qué importa mi client seed?",
        a: "El resultado depende de los dos seeds. Como puedes fijar tu propio client seed, el servidor no puede elegir un seed que favorezca un resultado que ya conoce.",
      },
      {
        q: "¿El verificador necesita conexión a internet o una cuenta?",
        a: "No. Funciona por completo en tu equipo y solo necesita los cuatro valores de la ronda.",
      },
    ],
  },

  how: {
    title: "Cómo funciona Provably fair: algoritmo HMAC-SHA256 paso a paso",
    description:
      "Algoritmo Provably fair de Gift Club paso a paso: hash del seed, flujo de bytes HMAC-SHA256, de bytes a floats y redondeo del pago, con ejemplo.",
    h1: "Cómo funciona el sorteo Provably fair",
    intro: "El algoritmo completo, con los números de una ronda real resuelta paso a paso.",
    commitHeading: "1. El compromiso: un server seed con hash",
    commitText:
      "El servidor elige un <strong>server seed</strong> aleatorio de 32 bytes y te muestra solo su hash SHA-256. El hash no revela nada del seed, pero lo fija: ningún otro seed tiene el mismo hash.",
    hmacHeading: "2. El flujo de bytes: HMAC-SHA256",
    hmacText:
      "Cada ronda usa como clave el server seed en bruto y como mensaje <code>clientSeed:nonce:round</code>. El <strong>nonce</strong> cuenta tus rondas con este par de seeds; <code>round</code> cuenta bloques de 32 bytes cuando un juego necesita más de 32 bytes.",
    floatHeading: "3. De bytes a números",
    floatText:
      "Cada cuatro bytes forman un float en [0, 1). La fórmula es exacta, así que el verificador compara el entero de 32 bits subyacente, nunca un decimal redondeado.",
    mapHeading: "4. De números a un resultado",
    mapText:
      "Cada juego convierte sus floats en un resultado con su propia regla publicada: una fila de rebotes a izquierda y derecha en Plinko, una baraja mezclada en Blackjack, un número de boleto en una caja. Los módulos de juego en <code>src/games/</code> contienen cada regla y cada tabla de pagos.",
    roundingHeading: "5. Redondeo del pago",
    roundingText:
      "Un premio en Estrellas es un número entero. Cuando apuesta × multiplicador tiene fracción, un float más decide si se redondea hacia arriba, así que el redondeo también es Provably fair. Los pagos en Gram, en cambio, se redondean hacia abajo al nanoton y no sortean ningún float de redondeo.",
    versionsHeading: "Versiones de la tabla de pagos",
    versionsText:
      "Cuando se reajusta una tabla de pagos, la antigua se queda en el código con su número de versión. Una ronda siempre se comprueba con la versión con la que se jugó, que aparece en los detalles de la ronda.",
    vectorsHeading: "Ejecuta las pruebas por tu cuenta",
    vectorsText: "La suite de pruebas reproduce miles de rondas calculadas por el servidor y comprueba cada byte:",
    faq: [
      {
        q: "¿Por qué HMAC-SHA256 y no un número aleatorio normal?",
        a: "Porque es determinista: los mismos seeds y el mismo nonce dan siempre los mismos bytes, así que un resultado se puede recalcular y comprobar. Un número aleatorio normal no se puede comprobar a posteriori.",
      },
      {
        q: "¿Pueden los mismos seeds producir dos resultados?",
        a: "No. Cada ronda usa un nonce nuevo, así que dos rondas con el mismo par de seeds nunca comparten bytes.",
      },
      {
        q: "¿Dónde están las reglas de los juegos?",
        a: "En src/games/, un archivo por juego, cada uno con las tablas de pagos que usa el servidor.",
      },
    ],
  },
};
