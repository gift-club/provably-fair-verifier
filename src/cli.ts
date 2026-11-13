#!/usr/bin/env node
/**
 * gift-club-verify: check a revealed server seed against its published hash and print the floats a
 * round drew.
 *
 *   npx @gift-club/provably-fair-verifier <serverSeed> <serverSeedHash> <clientSeed> <nonce> [count]
 *
 * Exit codes: 0 the seed matches its hash, 1 bad input, 2 the seed does not match (no floats printed).
 */
import { generateFloats, hexToBytes, isHex, sha256Hex } from "./provablyFair.js";

const USAGE = "Usage: gift-club-verify <serverSeed> <serverSeedHash> <clientSeed> <nonce> [count]";
const MAX_COUNT = 1024;

const fail = (message: string): never => {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
};

const [serverSeed, serverSeedHash, clientSeed, nonceArg, countArg = "8"] = process.argv.slice(2);

if (!serverSeed || !serverSeedHash || clientSeed === undefined || nonceArg === undefined) fail("Missing arguments.");
if (!isHex(serverSeed, 32) || !isHex(serverSeedHash, 32)) fail("The server seed and its hash are 64 hex characters each.");
if (!/^\d{1,15}$/.test(nonceArg)) fail(`The nonce is a whole number from 0, got "${nonceArg}".`);
if (!/^\d{1,4}$/.test(countArg) || Number(countArg) < 1 || Number(countArg) > MAX_COUNT) {
  fail(`The count is a whole number from 1 to ${MAX_COUNT}, got "${countArg}".`);
}

const seed = hexToBytes(serverSeed);
const hash = await sha256Hex(seed);
console.log(`SHA-256(server seed) = ${hash}`);
if (hash.toLowerCase() !== serverSeedHash.toLowerCase()) {
  console.log("✖ does NOT match the published hash. This seed did not draw the round, so no floats are shown.");
  process.exit(2);
}
console.log("✔ matches the hash published before the round");

const floats = await generateFloats(seed, clientSeed, Number(nonceArg), Number(countArg));
floats.forEach((f, i) => console.log(`float ${i}: ${f.value.toFixed(10)}  (uint32 ${f.uint})`));
