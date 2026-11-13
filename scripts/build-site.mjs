// Builds the GitHub Pages docs in docs/ from site/content/<lang>.mjs. Needs `npm run build` first (reads dist/).
// Run: node scripts/build-site.mjs
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LANGS, ORGANIZATION, breadcrumbs, esc, faqHtml, faqPage, pageUrl, writeSite } from "./site-kit.mjs";
import { links } from "../site/links.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = `${ROOT}docs`;
if (!existsSync(`${ROOT}dist/index.js`)) throw new Error("Run `npm run build` first: the docs compute their example with dist/.");
const pf = await import("../dist/index.js");
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
const REPO = "https://github.com/gift-club/provably-fair-verifier";

const site = {
  /** The release date: the sitemap lastmod of pages without their own data date. */
  updated: "2026-11-12",
  base: "https://gift-club.github.io/provably-fair-verifier",
  root: "/provably-fair-verifier/",
  repo: REPO,
  langs: LANGS,
  sisterKey: "verifier",
  name: {},
  short: {},
  nav: [
    { key: "home", path: "" },
    { key: "how", path: "how-it-works/" },
  ],
};

const content = {};
for (const lang of LANGS) {
  if (!existsSync(`${ROOT}site/content/${lang}.mjs`)) {
    console.warn(`No site/content/${lang}.mjs: skipping ${lang}`);
    continue;
  }
  content[lang] = (await import(`../site/content/${lang}.mjs`)).default;
  site.name[lang] = content[lang].siteName;
  site.short[lang] = content[lang].short;
}
const BUILT = LANGS.filter((l) => content[l]);
site.langs = BUILT;

// The worked example every page shows, computed by the package itself.
const ex = pf.EXAMPLE_ROUND;
const seed = pf.hexToBytes(ex.serverSeed);
const hash = await pf.sha256Hex(seed);
const bytes = await pf.generateBytes(seed, ex.clientSeed, ex.nonce, 8);
const floats = await pf.generateFloats(seed, ex.clientSeed, ex.nonce, 2);
const EX = {
  ...ex,
  hashOk: hash === ex.serverSeedHash,
  message: `${ex.clientSeed}:${ex.nonce}:0`,
  bytes: pf.bytesToHex(bytes).match(/../g).join(" "),
  b: Array.from(bytes.slice(0, 4)),
  float0: floats[0].value.toFixed(10),
  float1: floats[1].value.toFixed(10),
  uint0: floats[0].uint,
};
if (!EX.hashOk) throw new Error("EXAMPLE_ROUND hash mismatch");

const GAMES = [
  "crash", "plinko", "plinkoGold", "pachinko", "keno", "rollOver", "diceDuel", "coinFlip", "minefield", "minesTower",
  "balloonPump", "higherLower", "colorPredict", "rockPaperScissors", "magicDoor", "guessNumber", "match3", "slots",
  "roulette", "wheel", "crossing", "blackjack",
];
const DUELS = ["pvpBlackjack", "pvpMinefield", "pvpDiceDuel", "pvpBalloonPump", "pvpLudo", "pvpSeaWar", "pvpDama", "pvpCheckers"];

const code = (s) => `<pre><code>${esc(s)}</code></pre>`;
const related = (c, lang, keys) => {
  const seen = new Set();
  const items = keys.map((k) => links(lang, k)).filter((l) => l && !seen.has(l.url) && seen.add(l.url));
  return items.length
    ? `<h2>${esc(c.ui.relatedHeading)}</h2><ul>${items.map((l) => `<li><a href="${l.url}">${esc(l.title)}</a></li>`).join("")}</ul>`
    : "";
};
const software = (lang, description) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "Gift Club provably fair verifier",
  description,
  url: pageUrl(site, lang, ""),
  codeRepository: REPO,
  programmingLanguage: "TypeScript",
  runtimePlatform: ["Node.js", "Web browser"],
  license: "https://opensource.org/licenses/MIT",
  version: pkg.version,
  author: ORGANIZATION,
  publisher: ORGANIZATION,
});

const pages = [];
for (const lang of BUILT) {
  const c = content[lang];
  const crumb = (name, path) =>
    breadcrumbs([{ name: c.siteName, url: pageUrl(site, lang, "") }, ...(path ? [{ name, url: pageUrl(site, lang, path) }] : [])]);
  const checker = links(lang, "checker");

  // --- Overview ------------------------------------------------------------------------
  {
    const h = c.home;
    const body = `
<div class="answer"><p>${h.answer}</p></div>
<h2>${esc(h.stepsHeading)}</h2>
<ol>${h.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
<h2>${esc(h.cliHeading)}</h2>
<p>${h.cliText}</p>
${code(`npx ${pkg.name} \\
  ${ex.serverSeed} \\
  ${ex.serverSeedHash} \\
  ${ex.clientSeed} ${ex.nonce} 2

SHA-256(server seed) = ${hash}
✔ matches the hash published before the round
float 0: ${EX.float0}  (uint32 ${EX.uint0})
float 1: ${EX.float1}  (uint32 ${floats[1].uint})`)}
<h2>${esc(h.libHeading)}</h2>
${code(`npm install ${pkg.name}`)}
${code(`import { generateFloats, hexToBytes, sha256Hex } from "${pkg.name}";

const seed = hexToBytes(serverSeed);
(await sha256Hex(seed)) === serverSeedHash;              // the seed was fixed before the round
const [f] = await generateFloats(seed, clientSeed, nonce, 1); // the round's first draw, in [0, 1)`)}
<p>${h.libText}</p>
<h2>${esc(h.gamesHeading)}</h2>
<p>${h.gamesIntro}</p>
<p>${GAMES.map((g) => esc(c.games[g])).join(" · ")}</p>
<h3>${esc(h.duelsHeading)}</h3>
<p>${DUELS.map((g) => esc(c.games[g])).join(" · ")}</p>
<h3>${esc(h.collectHeading)}</h3>
<p>${h.collectText}</p>
${checker ? `<p>${h.browserText(`<a href="${checker.url}">${esc(checker.title)}</a>`)}</p>` : ""}
<h2>${esc(h.trustHeading)}</h2>
<p>${h.trustText}</p>
${related(c, lang, ["checker", "pfArticle", "legit"])}
${faqHtml(c.ui.faqHeading, h.faq)}
`;
    pages.push({
      path: "", lang, title: h.title, description: h.description, h1: h.h1, lead: h.lead, body,
      jsonLd: [software(lang, h.description), crumb("", ""), faqPage(h.faq)],
    });
  }

  // --- How it works --------------------------------------------------------------------
  {
    const w = c.how;
    const body = `
<p>${w.intro}</p>
<h2>${esc(w.commitHeading)}</h2>
<p>${w.commitText}</p>
${code(`server seed      ${ex.serverSeed}
SHA-256 (shown)  ${ex.serverSeedHash}`)}
<h2>${esc(w.hmacHeading)}</h2>
<p>${w.hmacText}</p>
${code(`key      = server seed (32 raw bytes)
message  = "${EX.message}"        // clientSeed:nonce:round
block    = HMAC-SHA256(key, message)
bytes    = ${EX.bytes} …`)}
<h2>${esc(w.floatHeading)}</h2>
<p>${w.floatText}</p>
${code(`float = b0/256 + b1/256² + b2/256³ + b3/256⁴
      = ${EX.b[0]}/256 + ${EX.b[1]}/65536 + ${EX.b[2]}/16777216 + ${EX.b[3]}/4294967296
      = ${EX.float0}`)}
<h2>${esc(w.mapHeading)}</h2>
<p>${w.mapText}</p>
<h2>${esc(w.roundingHeading)}</h2>
<p>${w.roundingText}</p>
<h2>${esc(w.versionsHeading)}</h2>
<p>${w.versionsText}</p>
<h2>${esc(w.vectorsHeading)}</h2>
<p>${w.vectorsText}</p>
${code(`git clone ${REPO}.git
cd provably-fair-verifier && npm install && npm test`)}
${related(c, lang, ["pfArticle", "checker"])}
${faqHtml(c.ui.faqHeading, w.faq)}
`;
    pages.push({
      path: "how-it-works/", lang, title: w.title, description: w.description, h1: w.h1, body,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: w.h1,
          description: w.description,
          inLanguage: lang,
          url: pageUrl(site, lang, "how-it-works/"),
          author: ORGANIZATION,
          publisher: ORGANIZATION,
          about: "Provably fair HMAC-SHA256 random number generation",
        },
        crumb(c.nav.how, "how-it-works/"),
        faqPage(w.faq),
      ],
    });
  }
}

rmSync(DOCS, { recursive: true, force: true });
const ui = Object.fromEntries(BUILT.map((l) => [l, { ...content[l].ui, nav: content[l].nav }]));
console.log(`Built ${writeSite(DOCS, site, pages, ui)} pages into docs/`);
