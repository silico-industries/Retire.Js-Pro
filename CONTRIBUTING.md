# Contributing to retire.js pro

Contributions are welcome — bug fixes, vulnerability database updates, new features, documentation improvements.

Before you submit anything, please read this document fully.

---

## Setting Up for Local Development

1. Clone the repository
2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** → navigate to `firefox/source/` → select `manifest.json` (or upload the xpi file)
4. After loading, visit a page and grant the extension permission when prompted (right-click the toolbar icon → *Allow on this site*)

> **Why the permission prompt?** Unsigned extensions loaded temporarily require explicit per-site permission each Firefox session. This is a Firefox security policy — not a bug in the extension. The signed AMO release does not have this limitation.

---

## Testing Your Changes

**Recommended test page:**
[research.insecurelabs.org/jquery/test/](https://research.insecurelabs.org/jquery/test/)

This page intentionally loads multiple outdated jQuery versions across different loading paths (URL, inline, CDN). It is purpose-built for testing RetireJS-based scanners and exercises most detection methods in a single page load.

**Testing checklist before submitting:**
- [ ] Extension loads without console errors in `about:debugging`
- [ ] Popup opens and shows the correct version number in the footer
- [ ] Detected vulnerabilities are confirmed to work using the test page above
- [ ] Dark/light mode toggle works and the choice persists after closing and reopening the popup
- [ ] **Export HTML** button generates a report that matches the active theme
- [ ] The exported report includes the scanned page URL in the header
- [ ] The version number in the exported report matches `manifest.json`
- [ ] Toggling the **Enabled** switch off switches the toolbar icon to greyscale and stops new detections

---

## Versioning

**The version number lives in exactly one place:**

```
firefox/source/manifest.json
```

```json
"version": "3.0.0"
```

The popup footer, the exported HTML report, and the badge all read the version at runtime via `browser.runtime.getManifest().version`. Do not update version strings anywhere else — there are none to update.

---

## Theme System

All colors are defined as CSS custom properties in `popup.html`:
- `:root` block — light mode token values
- `body.dark` block — dark mode overrides

The `generateReport()` function in `popup.js` reads these token values live from the DOM via `getComputedStyle(document.body)` at export time. There is no hardcoded color duplication between the popup UI and the exported report.

**To change a color:** edit the relevant `--color-*` variable in `popup.html`. The report inherits it automatically.

---

## Updating the Vulnerability Database

To update the bundled database to the latest RetireJS upstream:

```bash
curl https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json \
     -o firefox/source/js/jsrepository.json
```
(check TODO.md for more information about the updating process)

Then reload the extension in `about:debugging` and verify that existing detections still work on the test page.

---

## What Not to Submit

- Changes to `js/retire.js` — the core detection engine is intentionally left as upstream
- Build artifacts (`.xpi`, `.zip`)
- IDE config files or OS metadata (`.DS_Store`, `Thumbs.db`, `.vscode/`, etc.)

---

## Planned Work

See [docs/TODO.md](./docs/TODO.md) for the full list of planned features and open issues. Pick anything from the **open** section or propose something new.

---

## Pull Request Guidelines

- One change or fix per PR — keep scope focused
- Describe what changed and why in the PR description
- All checklist items above must pass before requesting review
- Reference the relevant TODO item if your PR addresses one

---

## License

By contributing, you agree that your contributions are licensed under the project's [Mozilla Public License 2.0](./LICENSE).
