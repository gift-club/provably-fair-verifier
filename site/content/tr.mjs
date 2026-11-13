// Doğrulayıcı belgelerinin Türkçe metni. en.mjs ile aynı yapıdadır.

export default {
  siteName: "Gift Club Provably fair doğrulayıcı",
  short: "Provably fair",

  ui: {
    navLabel: "Belge bölümleri",
    langsLabel: "Diller",
    footerBy: (brand) => `Hediye kasaları ve oyunlar sunan Telegram Mini App ${brand} tarafından açık kaynak olarak yayımlandı.`,
    moreLabel: "Gift Club'dan daha fazlası",
    sourceOnGithub: "Kaynak kod GitHub'da",
    sisters: { dataset: "Telegram data", calculator: "Stars calculator", verifier: "Provably fair verifier" },
    updated: "Güncellendi",
    faqHeading: "Sorular",
    relatedHeading: "Gift Club'da sıradaki yazı",
  },

  nav: { home: "Genel bakış", how: "Nasıl çalışır" },

  games: {
    crash: "Crash", plinko: "Plinko", plinkoGold: "Plinko Gold", pachinko: "Pachinko", keno: "Keno", rollOver: "Sayıyı Geç",
    diceDuel: "Zar Düellosu", coinFlip: "Yazı Tura", minefield: "Mayın Tarlası", minesTower: "Mayın Kulesi", balloonPump: "Balonu Şişir",
    higherLower: "Büyük mü Küçük mü", colorPredict: "Rengi Bil", rockPaperScissors: "Taş Kâğıt Makas", magicDoor: "Sihirli Kapı",
    guessNumber: "Sayı Tahmini", match3: "Üçlü Eşleştir", slots: "Slotlar", roulette: "Avrupa Ruleti", wheel: "Çark",
    crossing: "Kurmalı Geçit", blackjack: "Blackjack", pvpBlackjack: "Blackjack Düellosu", pvpMinefield: "Mayın Tarlası 1v1",
    pvpDiceDuel: "Zar 1v1", pvpBalloonPump: "Balon 1v1", pvpLudo: "Kızma Birader Düellosu", pvpSeaWar: "Amiral Battı", pvpDama: "Dama",
    pvpCheckers: "Amerikan Daması",
  },

  home: {
    title: "Provably fair doğrulayıcı: açık kaynak HMAC-SHA256 (npm)",
    description:
      "Her Gift Club turunu server seed, client seed ve nonce ile yeniden hesaplayan açık kaynak TypeScript. CLI ve npm kütüphanesi, sunucuyla test edildi.",
    h1: "Provably fair doğrulayıcı",
    lead: "Gift Club'daki herhangi bir turu kendi bilgisayarında, sunucunun çalıştırdığı matematikle kendin kontrol et.",
    answer:
      "Provably fair bir turu herkes yeniden hesaplayabilir. Tur başlamadan önce sunucu gizli bir server seed'in <strong>SHA-256 hash</strong>'ini yayımlar; turdan sonra seed'in kendisini açıklar. Bu paket seed'i hash ile karşılaştırır ve turu <strong>HMAC-SHA256</strong> ile yeniden çeker; böylece sonucun sen oynamadan önce belirlendiğini ve sonradan değiştirilmediğini görürsün.",
    stepsHeading: "Bir turu dört adımda doğrula",
    steps: [
      "Gift Club'daki tur ayrıntılarında, oynamadan önce gösterilen <strong>server seed hash</strong> değerini kopyala.",
      "Seed yenilendikten sonra açıklanan <strong>server seed</strong>'i, kendi <strong>client seed</strong> değerini ve turun <strong>nonce</strong> değerini kopyala.",
      "Doğrulayıcıyı çalıştır: seed'in SHA-256 değerinin hash'e eşit olduğunu kontrol eder, sonra turun sayılarını yeniden çeker.",
      "Yeniden çekilen sonucu geçmişindeki sonuçla karşılaştır. Bayt bayt aynıdır.",
    ],
    cliHeading: "Komut satırından",
    cliText: "npx ile kurulum gerekmez. Aşağıdaki örnek paketin kendi demo turudur:",
    libHeading: "Kütüphane olarak",
    libText:
      "Her oyunun kendi çekilişi (topun nereye düştüğü, hangi kartların dağıtıldığı, Crash noktası) bir ad alanıdır, örneğin <code>plinkoGold</code>, <code>crash</code> veya <code>collect</code>. TypeScript tipleri dahildir.",
    gamesHeading: "Neleri kapsar",
    gamesIntro: "Provably fair motoruyla çekiliş yapan tüm Gift Club oyunları, Yıldız ve Gram ile:",
    duelsHeading: "1v1 düellolar",
    collectHeading: "Kasalar ve kazı kazanlar",
    collectText:
      "Kasalar ve kazı kazanlar sabit bir bilet tablosundan çekiliş yapar: doğrulayıcı, hedef belirlenmiş bir çekiliş dahil, çekilişin hangi bileti seçtiğini yeniden hesaplar.",
    browserText: (link) => `Tarayıcıyı mı tercih edersin? Aynı değerleri şuraya yapıştır: ${link}.`,
    trustHeading: "Koda neden güvenebilirsin",
    trustText:
      "Her fonksiyon bir sunucu metodunu bayt bayt yansıtır ve testler onu sunucunun kendi kodunun ürettiği 2.600'den fazla girdi–çıktı vektörüne bağlar. Sunucunun matematiği değişirse, doğrulayıcı yeniden eşleşene kadar bu testler başarısız olur.",
    faq: [
      {
        q: "Provably fair ne demek?",
        a: "Herkesin, bir turun sonucunun bahisten önce belirlendiğini ve sonradan değiştirilmediğini kanıtlayabilmesi demek. Sunucu, hash'ini yayımlayarak gizli bir seed'e bağlanır, senin belirlediğin bir seed'i karıştırır ve sonucu yeniden hesaplayabilmen için kendi seed'ini sonra açıklar.",
      },
      {
        q: "Sunucu ben oynadıktan sonra sonucu değiştirebilir mi?",
        a: "Yakalanmadan olmaz: farklı bir seed farklı bir SHA-256 hash verir ve hash sana turdan önce gösterildi.",
      },
      {
        q: "Client seed'im neden önemli?",
        a: "Sonuç iki seed'e de bağlıdır. Kendi client seed'ini belirleyebildiğin için sunucu, bilinen bir sonucu kayıran bir seed seçemez.",
      },
      {
        q: "Doğrulayıcı internet bağlantısı ya da hesap gerektirir mi?",
        a: "Hayır. Tamamen senin bilgisayarında çalışır ve yalnızca turun dört değerine ihtiyaç duyar.",
      },
    ],
  },

  how: {
    title: "Provably fair nasıl çalışır: HMAC-SHA256 algoritması adım adım",
    description:
      "Gift Club'ın Provably fair algoritması adım adım: seed hash taahhüdü, HMAC-SHA256 bayt akışı, baytlardan float'a, ödeme yuvarlama ve çözümlü örnek.",
    h1: "Provably fair çekiliş nasıl çalışır",
    intro: "Tüm algoritma, gerçek bir örnek turun sayılarıyla adım adım çözülmüş halde.",
    commitHeading: "1. Taahhüt: hash'lenmiş server seed",
    commitText:
      "Sunucu rastgele 32 baytlık bir <strong>server seed</strong> seçer ve sana yalnızca SHA-256 hash'ini gösterir. Hash seed hakkında hiçbir şey ifşa etmez ama onu sabitler: başka hiçbir seed aynı hash'e sahip değildir.",
    hmacHeading: "2. Bayt akışı: HMAC-SHA256",
    hmacText:
      "Her tur, ham server seed'i anahtar, <code>clientSeed:nonce:round</code> değerini mesaj olarak kullanır. <strong>Nonce</strong>, bu seed çiftindeki turlarını sayar; <code>round</code>, bir oyun 32 bayttan fazlasına ihtiyaç duyduğunda 32 baytlık blokları sayar.",
    floatHeading: "3. Baytlardan sayılara",
    floatText:
      "Her dört bayt, [0, 1) aralığında bir float oluşturur. Formül kesindir; bu yüzden doğrulayıcı yuvarlanmış bir ondalığı değil, altındaki 32 bitlik tam sayıyı karşılaştırır.",
    mapHeading: "4. Sayılardan sonuca",
    mapText:
      "Her oyun float'larını kendi yayımlanmış kuralıyla bir sonuca çevirir: Plinko'da sola ve sağa sekmelerden oluşan bir sıra, Blackjack'te karılmış bir deste, kasada bir bilet numarası. <code>src/games/</code> içindeki oyun modülleri her kuralı ve her ödeme tablosunu barındırır.",
    roundingHeading: "5. Ödeme yuvarlama",
    roundingText:
      "Yıldız cinsinden kazanç tam sayıdır. Bahis × çarpan kesirli çıktığında bir float daha yukarı yuvarlanıp yuvarlanmayacağını belirler; yani yuvarlama da Provably fair'dir. Gram ödemeleri ise nanoton'a aşağı yuvarlanır ve yuvarlama için float çekmez.",
    versionsHeading: "Ödeme tablosu sürümleri",
    versionsText:
      "Bir ödeme tablosu yeniden ayarlandığında eskisi sürüm numarasıyla kodda kalır. Bir tur her zaman oynandığı sürüme göre kontrol edilir; bu sürüm turun ayrıntılarında görünür.",
    vectorsHeading: "Testleri kendin çalıştır",
    vectorsText: "Test paketi sunucunun hesapladığı binlerce turu yeniden oynatır ve her baytı kontrol eder:",
    faq: [
      {
        q: "Neden sıradan bir rastgele sayı değil de HMAC-SHA256?",
        a: "Çünkü deterministiktir: aynı seed'ler ve nonce her zaman aynı baytları verir, bu yüzden bir sonuç yeniden hesaplanıp kontrol edilebilir. Sıradan bir rastgele sayı sonradan kontrol edilemez.",
      },
      {
        q: "Aynı seed'ler iki farklı sonuç üretebilir mi?",
        a: "Hayır. Her tur yeni bir nonce kullanır; bu yüzden aynı seed çiftindeki iki tur baytlarını paylaşmaz.",
      },
      {
        q: "Oyun kuralları nerede?",
        a: "src/games/ içinde, oyun başına bir dosya; her biri sunucunun kullandığı ödeme tablolarıyla birlikte.",
      },
    ],
  },
};
