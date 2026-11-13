// Polski tekst dokumentacji weryfikatora. Ten sam kształt co w en.mjs.

export default {
  siteName: "Weryfikator Provably fair Gift Club",
  short: "Provably fair",

  ui: {
    navLabel: "Sekcje dokumentacji",
    langsLabel: "Języki",
    footerBy: (brand) => `Otwarty kod od ${brand}, Telegram Mini App ze skrzynkami z prezentami i grami.`,
    moreLabel: "Więcej od Gift Club",
    sourceOnGithub: "Kod źródłowy na GitHubie",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Zaktualizowano",
    faqHeading: "Pytania",
    relatedHeading: "Czytaj dalej na Gift Club",
  },

  nav: { home: "Przegląd", how: "Jak to działa" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Wyrzuć więcej",
    diceDuel: "Pojedynek w kości", coinFlip: "Rzut monetą", minefield: "Pole minowe", minesTower: "Wieża min", balloonPump: "Napompuj balon",
    higherLower: "Wyżej czy niżej", colorPredict: "Zgadnij kolor", rockPaperScissors: "Papier, kamień, nożyce", magicDoor: "Magiczne drzwi",
    guessNumber: "Zgadnij liczbę", match3: "Trzy w rzędzie", slots: "Automaty", roulette: "Ruletka europejska", wheel: "Koło",
    crossing: "Nakręcana przeprawa", blackjack: "Blackjack", pvpBlackjack: "Pojedynek w Blackjacka", pvpMinefield: "Pole minowe 1v1",
    pvpDiceDuel: "Kości 1v1", pvpBalloonPump: "Balon 1v1", pvpLudo: "Pojedynek w Chińczyka", pvpSeaWar: "Statki", pvpDama: "Warcaby tureckie",
    pvpCheckers: "Warcaby",
  },

  home: {
    title: "Weryfikator Provably fair: open source HMAC-SHA256 (npm)",
    description:
      "Otwarty kod TypeScript, który przelicza każdą rundę Gift Club z server seed, client seed i nonce. CLI i biblioteka npm, sprawdzone na wynikach samego serwera.",
    h1: "Weryfikator Provably fair",
    lead: "Sprawdź dowolną rundę Gift Club na własnym komputerze, tą samą matematyką, którą wykonał serwer.",
    answer:
      "Rundę Provably fair może przeliczyć każdy. Przed rundą serwer publikuje <strong>hash SHA-256</strong> tajnego server seed, a po niej sam seed. Ten pakiet sprawdza seed z hashem i losuje rundę od nowa przez <strong>HMAC-SHA256</strong>, więc widać, że wynik był ustalony przed grą i nie zmieniono go potem.",
    stepsHeading: "Zweryfikuj rundę w czterech krokach",
    steps: [
      "W szczegółach rundy w Gift Club skopiuj <strong>hash server seed</strong> pokazany przed grą.",
      "Gdy seed się zmieni, skopiuj ujawniony <strong>server seed</strong>, swój <strong>client seed</strong> i <strong>nonce</strong> rundy.",
      "Uruchom weryfikator: sprawdzi, że SHA-256 seeda równa się hashowi, i wylosuje liczby rundy od nowa.",
      "Porównaj przeliczony wynik z tym z historii. Zgadzają się co do bajta.",
    ],
    cliHeading: "Z wiersza poleceń",
    cliText: "Z npx nic nie trzeba instalować. Poniższy przykład to runda demonstracyjna samego pakietu:",
    libHeading: "Jako biblioteka",
    libText:
      "Losowanie każdej gry (gdzie spadnie kulka, jakie karty rozdano, punkt Crash) to osobna przestrzeń nazw, np. <code>plinkoGold</code>, <code>crash</code> lub <code>collect</code>. Typy TypeScript w komplecie.",
    gamesHeading: "Co obejmuje",
    gamesIntro: "Wszystkie gry Gift Club, które losują silnikiem Provably fair, za Gwiazdki i za Gram:",
    duelsHeading: "Pojedynki 1v1",
    collectHeading: "Skrzynki i zdrapki",
    collectText:
      "Skrzynki i zdrapki losują ze stałej tabeli biletów: weryfikator przelicza, który bilet wybrało losowanie, także przy ustawionym celu.",
    browserText: (link) => `Wolisz przeglądarkę? Wklej te same wartości w ${link}.`,
    trustHeading: "Dlaczego możesz zaufać kodowi",
    trustText:
      "Każda funkcja odtwarza metodę serwera co do bajta, a testy wiążą ją z ponad 2 600 wektorami wejście–wyjście, które wyprodukował kod samego serwera. Jeśli matematyka serwera się zmieni, testy zawiodą, dopóki weryfikator znów się z nią nie zgodzi.",
    faq: [
      {
        q: "Co znaczy Provably fair?",
        a: "Że każdy może udowodnić, że wynik rundy był ustalony przed zakładem i nie zmieniono go potem. Serwer zobowiązuje się do tajnego seeda, publikując jego hash, miesza seed, który ustawiasz ty, a swój seed ujawnia później, żeby można było przeliczyć wynik.",
      },
      {
        q: "Czy serwer może zmienić wynik po mojej grze?",
        a: "Nie tak, żeby nie wyszło to na jaw: inny seed daje inny hash SHA-256, a hash pokazano ci przed rundą.",
      },
      {
        q: "Dlaczego mój client seed ma znaczenie?",
        a: "Wynik zależy od obu seedów. Ponieważ własny client seed można ustawić samodzielnie, serwer nie może wybrać seeda sprzyjającego znanemu mu wynikowi.",
      },
      {
        q: "Czy weryfikator potrzebuje internetu albo konta?",
        a: "Nie. Działa w całości na twoim komputerze i potrzebuje tylko czterech wartości z rundy.",
      },
    ],
  },

  how: {
    title: "Jak działa Provably fair: algorytm HMAC-SHA256 krok po kroku",
    description:
      "Algorytm Provably fair Gift Club krok po kroku: hash seeda, strumień bajtów HMAC-SHA256, bajty na floaty, zaokrąglanie wypłat, z przykładem.",
    h1: "Jak działa losowanie Provably fair",
    intro: "Cały algorytm, z liczbami jednej prawdziwej rundy rozpisanymi krok po kroku.",
    commitHeading: "1. Zobowiązanie: zahashowany server seed",
    commitText:
      "Serwer wybiera losowy 32-bajtowy <strong>server seed</strong> i pokazuje ci tylko jego hash SHA-256. Hash nic nie zdradza o seedzie, ale go przypina: żaden inny seed nie ma takiego samego hasha.",
    hmacHeading: "2. Strumień bajtów: HMAC-SHA256",
    hmacText:
      "Kluczem każdej rundy jest surowy server seed, a wiadomością <code>clientSeed:nonce:round</code>. <strong>Nonce</strong> liczy twoje rundy na tej parze seedów; <code>round</code> liczy 32-bajtowe bloki, gdy gra potrzebuje więcej niż 32 bajtów.",
    floatHeading: "3. Od bajtów do liczb",
    floatText:
      "Każde cztery bajty dają jeden float z przedziału [0, 1). Wzór jest dokładny, więc weryfikator porównuje leżącą pod spodem 32-bitową liczbę całkowitą, nigdy zaokrąglony ułamek dziesiętny.",
    mapHeading: "4. Od liczb do wyniku",
    mapText:
      "Każda gra zamienia floaty w wynik własną opublikowaną regułą: rząd odbić w lewo i w prawo w Plinko, potasowana talia w Blackjacku, numer biletu w skrzynce. Moduły gier w <code>src/games/</code> zawierają każdą regułę i każdą tabelę wypłat.",
    roundingHeading: "5. Zaokrąglanie wypłat",
    roundingText:
      "Wygrana w Gwiazdkach jest liczbą całkowitą. Gdy stawka × mnożnik ma część ułamkową, jeszcze jeden float decyduje, czy zaokrąglić w górę, więc zaokrąglanie też jest Provably fair. Wypłaty w Gram są natomiast zaokrąglane w dół do nanotona i nie losują floata zaokrąglenia.",
    versionsHeading: "Wersje tabel wypłat",
    versionsText:
      "Gdy tabela wypłat jest przestrajana, stara zostaje w kodzie pod swoim numerem wersji. Rundę zawsze sprawdza się według wersji, na której ją rozegrano, co pokazują szczegóły rundy.",
    vectorsHeading: "Uruchom testy u siebie",
    vectorsText: "Zestaw testów odtwarza tysiące rund obliczonych przez serwer i sprawdza każdy bajt:",
    faq: [
      {
        q: "Dlaczego HMAC-SHA256, a nie zwykła liczba losowa?",
        a: "Bo jest deterministyczny: te same seedy i nonce zawsze dają te same bajty, więc wynik można przeliczyć i sprawdzić. Zwykłej liczby losowej nie da się sprawdzić po fakcie.",
      },
      {
        q: "Czy te same seedy mogą dać dwa wyniki?",
        a: "Nie. Każda runda używa nowego nonce, więc dwie rundy na jednej parze seedów nie mają wspólnych bajtów.",
      },
      {
        q: "Gdzie są reguły gier?",
        a: "W src/games/, po jednym pliku na grę, każdy z tabelami wypłat używanymi przez serwer.",
      },
    ],
  },
};
