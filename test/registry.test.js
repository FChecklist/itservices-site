// Product-code registry vs the live central-ledger code (boss16, 16 Nov 2026).
// registry/PRODUCT-REGISTRY.json is a copy of C:\ct\marketing-ledger\registry\PRODUCT-REGISTRY.json (updated 2026-11-12, owner-approved codes).
// What this guards: a code in SITE_CODES/TEST_FROM that the owner never approved, a duplicated or malformed code, a code the owner has NOT yet
// confirmed (status NEW) slipping into the payment path, and a pages.dev origin the pay-frame allows without a ledger code.
// Run: bun test test/registry.test.js
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_CODES, TEST_FROM } from "../functions/_lib.js";

const ROOT = join(import.meta.dir, "..");
const registry = JSON.parse(readFileSync(join(ROOT, "registry", "PRODUCT-REGISTRY.json"), "utf8")).products;
const byCode = new Map(registry.map((p) => [p.code, p]));
const ledgerCodes = Object.values(SITE_CODES);

// Known, written-down exceptions. Each one must be removed from here the day it is resolved (the test below fails if it is resolved but left listed).
// IDX: in TEST_FROM and in tools/ufooter.py (name "Corporate Games", https://corporate-games.pages.dev) but absent from the registry and from SITE_CODES.
//      Meaning is NOT recorded by the owner; the likely reading is the older Corporate Games home (registry HOM) but that is unconfirmed.
const TEST_FROM_NOT_IN_REGISTRY = ["IDX"];

describe("every code in the central ledger is a registered, approved code", () => {
  test("each code is 3 capital letters and no code is used for two websites", () => {
    for (const c of ledgerCodes) expect(c).toMatch(/^[A-Z]{3}$/);
    expect(new Set(ledgerCodes).size).toBe(ledgerCodes.length);
  });
  test("each SITE_CODES code is in the registry as EXISTING or an owner-APPROVED code, never NEW", () => {
    for (const c of ledgerCodes) {
      const p = byCode.get(c);
      expect(p, `${c} is in SITE_CODES but not in the registry`).toBeTruthy();
      expect(p.status, `${c} must be EXISTING or APPROVED before it takes payments`).toMatch(/^(EXISTING|APPROVED)/);
    }
  });
  test("the 9 codes that were live before this change are untouched", () => {
    for (const c of ["TAM", "BNG", "TTT", "SNL", "LBC", "LDR", "DPD", "COA", "ITS"]) expect(ledgerCodes).toContain(c);
  });
  test("the registry has no duplicate code", () => {
    expect(new Set(registry.map((p) => p.code)).size).toBe(registry.length);
  });
});

describe("the ?from= list and the pay-frame allow-list", () => {
  test("every TEST_FROM code is a registry code, except the written-down exceptions", () => {
    const missing = TEST_FROM.filter((c) => !byCode.has(c));
    expect(missing).toEqual(TEST_FROM_NOT_IN_REGISTRY);
  });
  test("every *.pages.dev origin the pay-frame allows (ALLOWED in build.py) has a ledger code", () => {
    const build = readFileSync(join(ROOT, "build.py"), "utf8");
    const m = build.match(/var ALLOWED = \[([^\]]*)\]/);
    expect(m, "ALLOWED list not found in build.py").toBeTruthy();
    const origins = [...m[1].matchAll(/"https:\/\/([^"]+)"/g)].map((x) => x[1]);
    expect(origins.length).toBeGreaterThan(5);
    const pagesDev = origins.filter((h) => h.endsWith(".pages.dev"));
    expect(pagesDev.length).toBeGreaterThan(0);
    for (const h of pagesDev) expect(SITE_CODES[h], `${h} is allowed to frame the pay page but has no ledger code`).toBeTruthy();
  });
});
