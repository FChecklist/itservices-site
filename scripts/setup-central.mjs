// One-off setup: makes a secret key per website, stores only its sha256 in D1 (site.key_hash), writes the raw keys to the git-ignored .site-keys.json and the SQL to a temp file.
// Usage: node scripts/setup-central.mjs <out.sql>   (then run the SQL with wrangler d1 execute). Re-running keeps existing keys.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const SITES = ["corporate-tambola.pages.dev", "rajat-agarwal-startup-coach.pages.dev", "veridian-aios.com", "corporate-bingo.pages.dev", "corporate-tic-tac-toe.pages.dev", "corporate-snakes-and-ladders.pages.dev", "corporate-luck-by-chance.pages.dev"];
const file = new URL("../.site-keys.json", import.meta.url);
const keys = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
let sql = "";
for (const s of SITES) {
  keys[s] ??= "psk_" + randomBytes(24).toString("hex");
  sql += `UPDATE site SET key_hash='${createHash("sha256").update(keys[s]).digest("hex")}' WHERE host='${s}';\n`;
}
writeFileSync(file, JSON.stringify(keys, null, 1));
writeFileSync(process.argv[2], sql);
console.log("keys for", Object.keys(keys).join(", "));
