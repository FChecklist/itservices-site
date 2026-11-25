// Guard: every page carries the small mark १३९ exactly once, with the approved CSS. Run: bun test
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MARK = '<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>';
const CSS1 = '.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}';
const CSS2 = ".mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}";
const read = (p) => readFileSync(p, "utf8");
const htmlIn = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? htmlIn(p) : p.endsWith(".html") ? [p] : []; });

// Build the site (build.py writes only into the repo's own dist/), then scan the built pages.
const b = Bun.spawnSync(["python3", join(ROOT, "build.py")], { cwd: ROOT });
const DIST = join(ROOT, "dist");
const pages = htmlIn(DIST);
const hasCss = (txt) => txt.includes(CSS1) && txt.includes(CSS2);

test("the site builds", () => { expect(b.exitCode).toBe(0); expect(pages.length).toBeGreaterThan(8); });

test("every built page has exactly one mark, with the approved markup", () => {
  for (const p of pages) {
    const t = read(p);
    expect([p, (t.match(/class="mark139"/g) || []).length]).toEqual([p, 1]);
    expect([p, t.includes(MARK)]).toEqual([p, true]);
    // the mark is the very first thing in the body
    expect([p, /<body[^>]*>/.test(t) && t.slice(t.search(/<body[^>]*>/)).replace(/^<body[^>]*>\s*/, "").startsWith(MARK)]).toEqual([p, true]);
  }
});

test("the approved CSS is in the shared stylesheet and in each page that does not load it", () => {
  expect(hasCss(read(join(ROOT, "site.css")))).toBe(true);
  for (const p of pages) {
    const t = read(p);
    // a page either links the shared sheet (checked above to hold the CSS, and the sheet exists) or carries the CSS itself
    if (!/<link[^>]+href="\/site\.css[^"]*"/.test(t)) expect([p, hasCss(t)]).toEqual([p, true]);
  }
});

test("the source of the standalone pages carries the same mark and CSS", () => {
  const c = read(join(ROOT, "static/console.html"));
  expect((c.match(/class="mark139"/g) || []).length).toBe(1);
  expect(c.includes(MARK) && hasCss(c)).toBe(true);
});

test("every html source file in the repo (outside dist and node_modules) carries the mark and CSS", () => {
  const skip = new Set(["dist", "node_modules", ".git"]);
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return skip.has(n) ? [] : statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : []; });
  const srcs = walk(ROOT);
  expect(srcs.length).toBeGreaterThan(0);
  for (const p of srcs) { const t = read(p); expect([p, t.includes(MARK) && hasCss(t)]).toEqual([p, true]); }
});

test("colours, size, weight and numerals are the approved ones", () => {
  const css = CSS1 + CSS2;
  for (const s of ["#0B2A6B", "#7A1010", "6px", "font-weight:700", ".5px", "१३९", "pointer-events:none", "user-select:none"])
    expect(css.includes(s) || MARK.includes(s)).toBe(true);
  expect(read(join(ROOT, "site.css"))).toContain("color:#0B2A6B");
});
