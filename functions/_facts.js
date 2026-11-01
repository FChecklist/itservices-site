// What the console cannot read live: test totals. Update this when a full test run finishes (owner order 2026-10-27: one console for every website).
// Counts are tests that passed / failed in the last full run of that site's own suite; null means "no full run recorded here yet".
export const FACTS = {
  asOf: "2026-10-27",
  sites: {
    "corporate-tambola.pages.dev": { name: "Corporate Tambola", url: "https://corporatetambola.com", tests: { passed: 2783, failed: 2, files: 131, note: "full suite; plus 960+ journey scenarios, 9,841 permission scenarios, 9 real-site games (100/250/500 people)" } },
    "corporate-bingo.pages.dev": { name: "Corporate Bingo", url: "https://corporate-bingo.pages.dev", tests: null },
    "corporate-tic-tac-toe.pages.dev": { name: "Corporate Tic-Tac-Toe", url: "https://corporate-tic-tac-toe.pages.dev", tests: null },
    "corporate-snakes-and-ladders.pages.dev": { name: "Corporate Snakes and Ladders", url: "https://corporate-snakes-and-ladders.pages.dev", tests: null },
    "corporate-luck-by-chance.pages.dev": { name: "Corporate Luck by Chance", url: "https://corporate-luck-by-chance.pages.dev", tests: null },
    "corporate-luckydraw.pages.dev": { name: "Corporate Lucky Draw", url: "https://corporate-luckydraw.pages.dev", tests: null },
    "veridian-aios.com": { name: "Veridian DPDP", url: "https://app.veridian-aios.com", tests: null },
    "rajat-agarwal-startup-coach.pages.dev": { name: "Startup Coach", url: "https://rajat-agarwal-startup-coach.pages.dev", tests: null },
    "itservices-rajat-agarwal.pages.dev": { name: "IT Services by Rajat Agarwal", url: "https://itservices-rajat-agarwal.pages.dev", tests: { passed: null, failed: null, files: null, note: "bun test test/ (payment ledger, privacy, payment test, console)" } },
  },
};
