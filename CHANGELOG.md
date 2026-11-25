# itservices-site: version and notes

This repository had no version number and no release notes before 26 Nov 2026 (checked: no version file, no changelog, no package file; the "Version 3.0" lines in `build.py` are the policy-document versions, not the site). This file starts them, so every change from now on carries a number and a note.

## 1.0.1 (26 Nov 2026) - PR #4, NOT deployed, NOT merged
Owner order of 25 Nov 2026: the small mark "१३९" at the very top centre of every page.
- Added: `<div class="mark139">` as the first element of the body on every built page (404, about, console, contact, index, offline, payframe, paytest, privacy, refund, shipping, terms); its CSS once in `site.css` and inline in the pages that do not load it. Absolute at the top, no clicks, hidden from screen readers, no layout change.
- Added: `test/mark139.test.js` (exactly one mark per page, approved markup and CSS, mark first in the body, every html source file carries it). Falsifiability shown: with the mark moved out of the first place in the shared page template the test goes red; restored, it passes.
- Changed: nothing else. No wording, price, payment or link changed.
- Audits: two audit rounds are on PR #4 (see its comments). Round 2 asked for this file (the rule: every change bumps the version and notes) and for a stronger placement check; both are done here.

## 1.0.0 (before 25 Nov 2026)
Everything the site was before the mark (no numbered releases existed; see the git history).
