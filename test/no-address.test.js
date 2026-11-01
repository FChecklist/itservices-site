// Written from the owner's order (1 Nov 2026), not from the build code:
//   "No city, state or street address anywhere: only India. Jurisdiction wording: the courts in India."
// Builds the site (python build.py) and reads every file that would be published. Run: bun test test/no-address.test.js
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const PLACE = /ghaziabad|uttar pradesh|indirapuram|shipra|krishna vista|B-1105|\b201014\b|streetAddress|addressLocality|addressRegion|postalCode/i;

describe("no city, state or street address in anything published", () => {
  test("the checker catches a city, and ignores plain India", () => {
    expect(PLACE.test("Based in Ghaziabad")).toBe(true);
    expect(PLACE.test('"addressCountry": "IN"; a sole proprietorship in India')).toBe(false);
  });
  test("build, then read every text file in dist", () => {
    const b = Bun.spawnSync(["python", "build.py"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(b.exitCode, new TextDecoder().decode(b.stderr)).toBe(0);
    const files = walk(DIST).filter((f) => /\.(html|xml|txt|json|js|css|webmanifest)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    const bad = [];
    for (const f of files) { const t = readFileSync(f, "utf8"); const m = t.match(PLACE); if (m) bad.push(`${relative(DIST, f)}: ${m[0]}`); }
    expect(bad).toEqual([]);
  }, 90_000);
  test("the sources that write the pages and the e-mails carry no place name either", () => {
    const bad = [];
    for (const f of ["build.py", "tools/ufooter.py"]) { const m = readFileSync(join(ROOT, f), "utf8").match(PLACE); if (m) bad.push(`${f}: ${m[0]}`); }
    expect(bad).toEqual([]);
  });
});
