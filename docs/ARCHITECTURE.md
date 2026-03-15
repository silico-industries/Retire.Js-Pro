# Architecture — retire.js pro

## Overview

retire.js pro is a Firefox MV3 browser extension (chromium port in progress) that detects known-vulnerable JavaScript libraries loaded by web pages. It intercepts script network requests via `webRequest`, runs them through the RetireJS detection engine, and delivers results to the popup UI through a content script message channel.

All processing happens locally. No data is sent to any external server.

**Target platform:** Firefox 140+ , Manifest V3
**Extension ID:** `retire.js-pro@silico-industries`

---

## Component Map

```
┌──────────────────────────────────────────────────────────────────┐
│  background.html  (background page)                              │
│                                                                  │
│  ┌────────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  background.js  │   │  retire.js   │   │ sandbox iframe   │   │
│  │  (orchestrator) │   │  (engine)    │   │ sandbox.js +     │   │
│  │                 │   │              │   │ innersandbox.js  │   │
│  └───────┬─────────┘   └──────────────┘   └────────┬─────────┘   │
│          │  webRequest.onCompleted                  │ postMessage │
└──────────┼──────────────────────────────────────────┼────────────┘
           │  tabs.sendMessage (result push)           │
           ▼                                           │
┌──────────────────────┐                              │
│  content.js          │ ◄────────────────────────────┘
│  (per-tab collector) │
└──────────┬───────────┘
           │  runtime.sendMessage (getDetected)
           ▼
┌────────────────────────────────────┐
│  popup.html + popup.js             │
│  (UI, theme toggle, HTML export)   │
└────────────────────────────────────┘
```

---

## Detection Pipeline

For each script request that completes (`webRequest.onCompleted`), `background.js` runs up to five detection passes in sequence:

| Pass | Method | Input |
|------|--------|-------|
| 1 | URI pattern | Script URL |
| 2 | Filename pattern | Extracted filename from URL |
| 3 | Content pattern | Downloaded script body |
| 4 | Hash (SHA1) | SHA1 digest of script body |
| 5 | Function extractor | Script evaluated in sandbox iframe; runtime globals probed |

Each pass calls into `retire.js` with the appropriate scan function. Matches are checked against the vulnerability database to resolve severity, CVE/GHSA identifiers, and reference URLs.

---

## Sandbox Architecture

Function-based detection requires executing untrusted script content. This is done through a two-level sandboxed iframe chain:

```
background.html
  └── sandbox.html  (sandboxed iframe, allow-scripts)
        └── inner-sandbox.html  (nested iframe, allow-scripts)
```

- `background.js` sends the script content to `sandbox.js` via `postMessage`
- `sandbox.js` relays it to `innersandbox.js` inside the nested iframe
- `innersandbox.js` uses `new Function()` to evaluate the script, then runs the extractor functions against the resulting globals
- The extracted version string is returned up the chain

This isolates arbitrary script execution from the extension's privileged background context.

---

## Message Bus

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `webRequest.onCompleted` | Browser → background | Notify of completed script request |
| `tabs.sendMessage` | Background → content | Push scan result to per-tab collector |
| `runtime.onMessage { getDetected: 1 }` | Popup → content | Fetch accumulated results for display |
| `runtime.sendMessage { enabled? }` | Popup → background | Query scan on/off state |
| `runtime.sendMessage { enable: bool }` | Popup → background | Toggle scanning globally |
| `postMessage` | Background ↔ sandbox | Send script for function-based detection |

---

## State Management

- `background.js` maintains a `vulnerable` map: `scriptUrl → results[]`
- `content.js` accumulates `totalResults[]` per tab — reset only on page reload
- `popup.js` polls content on open and every 5 seconds via `{ getDetected: 1 }`
- Theme preference persisted in `browser.storage.local` under key `theme`
- Scan enabled/disabled state persisted in `browser.storage.local` under key `enabled`

---

## Permissions

| Permission | Why |
|------------|-----|
| `webRequest` | Observe completed script requests across all pages |
| `tabs` | Push scan results to content scripts; query active tab URL in popup |
| `webNavigation` | Reset badge count on main-frame navigation |
| `host_permissions: <all_urls>` | Allows webRequest + content script injection on all domains |

---

## Vulnerability Database

**File:** `firefox/source/js/jsrepository.json`
**Source:** [RetireJS upstream](https://github.com/RetireJS/retire.js/blob/master/repository/jsrepository.json)
**Current bundle:** 65 libraries, 488 vulnerability records, 346 CVEs (v3.0.0)

The database is intentionally bundled rather than fetched remotely on every run. A runtime auto-update mechanism (background fetch from a controlled GitHub raw URL, cached in `browser.storage.local`, with fallback to bundled) is fully designed and pending implementation — see [TODO.md](./TODO.md).

### Database Entry Schema

```json
"library-name": {
  "vulnerabilities": [
    {
      "atOrAbove": "1.0.0",
      "below": "3.5.0",
      "severity": "medium",
      "identifiers": {
        "CVE": ["CVE-2020-11022"],
        "GHSA": ["GHSA-..."]
      },
      "info": ["https://..."]
    }
  ],
  "extractors": {
    "func":        ["window.$.fn.jquery"],
    "uri":         ["jquery-([.0-9a-zA-Z]*)(\.min)?\.js"],
    "filename":    ["jquery-([.0-9a-zA-Z]*)(\.min)?\.js"],
    "filecontent": ["jQuery v([^\\s]*)"],
    "hashes":      { "sha1-hash-string": "version" }
  }
}
```

---

## Theme System

All UI colors are CSS custom properties defined in `popup.html`:

- `:root` — light mode token values
- `body.dark` — dark mode overrides

The `generateReport()` function in `popup.js` reads token values at export time via `getComputedStyle(document.body)` — no hardcoded color duplication between the popup UI and the exported HTML report.

---

## Versioning

Version is defined in exactly one place: `firefox/source/manifest.json`.

At runtime, `popup.js` reads it via `browser.runtime.getManifest().version` and injects it into the popup footer badge and exported report footer. No other file contains a version string.

---

## Known Design Notes

- `retire.js` (the core engine) is intentionally left unmodified from upstream v1.2.12. All project-specific logic lives in the surrounding extension files.
- The `sandbox` iframe uses `allow-scripts` permission — required for `new Function()` execution inside the iframe. The outer `background.html` is a privileged extension page; the sandbox iframe is isolated from it by design.
- `postMessage` channels between background and sandbox use origin validation: background accepts only `moz-extension://` and `null` (sandboxed iframe origin); sandbox accepts only the extension origin.
