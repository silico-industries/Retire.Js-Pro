# TODO — retire.js pro

Open tasks, planned features, and ideas. Grouped by priority. Not a commitment — a working list.

Contributions are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) before starting work on any item.

---

## High Priority


- [ ] **Runtime database updates** — auto-fetch latest `jsrepository.json` from upstream at runtime, cache via `browser.storage.local`, fall back to bundled on failure. Full design is already written internally — implementation target is `js/background.js` → `downloadRepo()` (fetch from github root repo at `main/db/jsrepository.json`)
- [ ] **Popup Markdown rendering** — render vulnerability/advisory descriptions as Markdown (inline code/backticks + code blocks) instead of showing literal `` `...` `` characters.
- [ ] **Chromium ** — adapt manifest for Chrome/Edge MV3: replace `browser.*` namespace with `chrome.*` or use a compatibility shim, migrate background page to service worker.
- [ ] **GitHub Actions CI** — automated & manual cron jobs for updating jsrepository.json from upstream.



---

## Medium Priority



- [ ] **Re-scan button** — force re-check of the current page without requiring a full reload
- [ ] **Severity filter** — filter results table by severity (Critical / High / Medium / Low / Unknown)
- [ ] **JSON export** — export results as structured JSON alongside the existing HTML report

---

## Low Priority / Ideas

- [ ] **Options page** — dedicated settings page: DB update interval, ignored libraries, scan preferences
- [ ] **Keyboard shortcut** — configurable shortcut to open popup
- [ ] **Badge color by severity** — red for critical/high findings, yellow for medium, green for safe
- [ ] **GitHub Actions CI** — automated lint and DB freshness check on push to main


---

## Completed ✓

- [x] Dark mode — default on first install, persists via `browser.storage.local`
- [x] Light/dark toggle — SVG sun/moon icon in popup header
- [x] Scanned page URL displayed in popup toolbar and included in exported HTML report
- [x] HTML report export — self-contained, theme-aware (inherits active dark/light tokens)
- [x] Dynamic version badge — reads `manifest.json` at runtime, no manual sync
- [x] DRY theme system — report colors read via `getComputedStyle`, no hardcoded hex duplication
- [x] Extension icon embedded as base64 in exported reports
- [x] Attribution comment blocks in source files
- [x] Prototype pollution removed — `Object.prototype.mapOwnProperty` and `Array.prototype.flatten` replaced with local helpers
- [x] Function-based detection restored — `innersandbox.js` extractor overwrite bug fixed
- [x] `postMessage` origin validation added to background, sandbox, and innersandbox
- [x] Badge reset on page navigation — `webNavigation.onCommitted` listener added
- [x] Vulnerability database updated — 65 libraries, 488 records, 346 CVEs
- [x] **GitHub Actions CI** — automated & manual cron jobs for creating xpi file and uploading to GitHub releases.
