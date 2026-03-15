/**
 * retire.js pro — Popup UI Logic
 *
 * Scans web pages for vulnerable JavaScript libraries using the RetireJS
 * vulnerability database. Displays results in the popup and exports them as
 * a self-contained HTML report that inherits the active theme.
 *
 * Project : https://github.com/silico-industries/retire.js-pro
 * Author  : silico (silico industries)
 */

window.addEventListener(
  "load",
  function () {
    // ===== State =====
    var totalResultsCache = null;
    var scannedPageUrl = null;
    var iconDataUrl = null; // base64 icon48, pre-loaded for report embedding

    // ===== Extension metadata (read once from manifest) =====
    var extVersion =
      typeof browser !== "undefined" &&
      browser.runtime &&
      browser.runtime.getManifest
        ? browser.runtime.getManifest().version || "?"
        : "?";

    // ===== DOM References =====
    var enabledCheckbox = document.getElementById("enabled");
    var unknownCheckbox = document.getElementById("unknown");
    var resultsTable = document.getElementById("results");
    var resultsBody = resultsTable ? resultsTable.querySelector("tbody") : null;
    var noResultsMsg = document.getElementById("no-results-msg");
    var vulnCountEl = document.getElementById("vulnerabilities-count");
    var libCountEl = document.getElementById("libraries-count");
    var exportBtn = document.getElementById("export-report");
    var themeToggle = document.getElementById("theme-toggle");
    var iconMoon = document.getElementById("theme-icon-moon");
    var iconSun = document.getElementById("theme-icon-sun");
    var pageInfoEl = document.getElementById("page-info");
    var versionBadgeEl = document.getElementById("version-badge");

    // ===== Set version badge from manifest (no more hardcoded v3.0.0) =====
    if (versionBadgeEl) versionBadgeEl.textContent = "v" + extVersion;

    // ===== Pre-load extension icon as base64 for HTML report embedding =====
    if (
      typeof browser !== "undefined" &&
      browser.runtime &&
      browser.runtime.getURL
    ) {
      fetch(browser.runtime.getURL("icons/icon48.png"))
        .then(function (r) {
          return r.blob();
        })
        .then(function (blob) {
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onloadend = function () {
              resolve(fr.result);
            };
            fr.readAsDataURL(blob);
          });
        })
        .then(function (dataUrl) {
          iconDataUrl = dataUrl;
        })
        .catch(function () {
          iconDataUrl = null;
        });
    }

    // ===== Initialise theme =====
    function applyTheme(theme) {
      if (theme === "dark") {
        document.body.classList.add("dark");
        if (iconMoon) iconMoon.style.display = "none";
        if (iconSun) iconSun.style.display = "block";
      } else {
        document.body.classList.remove("dark");
        if (iconMoon) iconMoon.style.display = "block";
        if (iconSun) iconSun.style.display = "none";
      }
    }

    if (
      typeof browser !== "undefined" &&
      browser.storage &&
      browser.storage.local
    ) {
      browser.storage.local.get("theme").then(function (res) {
        var theme = res.theme;
        if (!theme) {
          theme = "dark"; // Default on first install
        }
        applyTheme(theme);
      });
    } else {
      // Fallback or dev mode
      applyTheme("dark");
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        var isDark = document.body.classList.contains("dark");
        var newTheme = isDark ? "light" : "dark";
        applyTheme(newTheme);
        if (
          typeof browser !== "undefined" &&
          browser.storage &&
          browser.storage.local
        ) {
          browser.storage.local.set({ theme: newTheme });
        }
      });
    }

    // ===== Initialise enabled state =====
    sendMessage("enabled?", null, function (response) {
      if (response && enabledCheckbox) {
        enabledCheckbox.checked = response.enabled;
      }
    });

    // ===== Event: toggle scan enabled =====
    if (enabledCheckbox) {
      enabledCheckbox.addEventListener("change", function () {
        browser.action.setIcon({
          path: this.checked ? "icons/icon48.png" : "icons/icon_bw48.png",
        });
        sendMessage("enable", this.checked, null);
      });
    }

    // ===== Event: toggle show-unknown =====
    if (unknownCheckbox) {
      unknownCheckbox.addEventListener("change", function () {
        if (resultsTable) {
          if (this.checked) {
            resultsTable.classList.remove("hideunknown");
          } else {
            resultsTable.classList.add("hideunknown");
          }
        }
      });
    }

    // ===== Event: export report =====
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        if (totalResultsCache && totalResultsCache.length > 0) {
          generateReport(totalResultsCache);
        } else {
          alert(
            "No scan results to export yet. Please wait for a page to be scanned.",
          );
        }
      });
    }

    // ===== Poll for results =====
    queryForResults();
    setInterval(queryForResults, 5000);

    function queryForResults() {
      browser.tabs.query(
        { active: true, currentWindow: true },
        function (tabs) {
          if (tabs && tabs.length > 0) {
            scannedPageUrl = tabs[0].url || null;
            updatePageInfo();
            browser.tabs.sendMessage(
              tabs[0].id,
              { getDetected: 1 },
              function (response) {
                show(response);
              },
            );
          } else {
            scannedPageUrl = null;
            updatePageInfo();
          }
        },
      );
    }

    // ===== Show results in popup =====
    function show(totalResults) {
      if (!resultsBody) return;
      totalResultsCache = totalResults;

      resultsBody.innerHTML = "";
      var vulnCount = 0;
      var libCount = 0;

      if (!totalResults || totalResults.length === 0) {
        if (noResultsMsg) noResultsMsg.style.display = "";
        if (resultsTable) resultsTable.style.display = "none";
        if (vulnCountEl) vulnCountEl.textContent = "0";
        if (libCountEl) libCountEl.textContent = "0";
        return;
      }

      // Merge results by URL
      var merged = {};
      totalResults.forEach(function (rs) {
        if (!merged[rs.url]) {
          merged[rs.url] = { url: rs.url, results: [] };
        }
        merged[rs.url].results = merged[rs.url].results.concat(rs.results);
      });

      // Flatten
      var res = [];
      Object.keys(merged).forEach(function (k) {
        var rs = merged[k];
        rs.results.forEach(function (r) {
          r.url = rs.url;
          r.vulnerable = r.vulnerabilities && r.vulnerabilities.length > 0;
        });
        if (rs.results.length === 0) {
          rs.results = [{ url: rs.url, unknown: true, component: "unknown" }];
        }
        res = res.concat(rs.results);
      });

      // Sort: vulnerable first, unknown last
      res.sort(function (x, y) {
        if (x.vulnerable !== y.vulnerable) return x.vulnerable ? -1 : 1;
        if (x.unknown !== y.unknown) return x.unknown ? 1 : -1;
        return (x.component + x.version).localeCompare(y.component + y.version);
      });

      // Track unique libraries
      var seenLibs = {};

      res.forEach(function (r) {
        var tr = document.createElement("tr");

        if (r.unknown) {
          tr.className = "unknown";
        } else if (r.vulnerable) {
          tr.className = "vulnerable";
          vulnCount++;
        }

        if (!r.unknown) {
          var libKey = (r.component || "") + "|" + (r.version || "");
          if (!seenLibs[libKey]) {
            seenLibs[libKey] = true;
            libCount++;
          }
        }

        // --- Cell: Library name ---
        var tdLib = document.createElement("td");
        tdLib.className = "cell-lib";
        tdLib.textContent = r.component || "—";
        tr.appendChild(tdLib);

        // --- Cell: Version ---
        var tdVer = document.createElement("td");
        tdVer.className = "cell-version";
        tdVer.textContent = r.version || "—";
        tr.appendChild(tdVer);

        // --- Cell: Info/Details ---
        var tdInfo = document.createElement("td");
        tdInfo.className = "cell-info";

        if (r.unknown) {
          tdInfo.textContent = "Did not recognize: ";
          var urlSpan = document.createElement("span");
          urlSpan.className = "url-chip";
          urlSpan.title = r.url;
          urlSpan.textContent = r.url;
          tdInfo.appendChild(urlSpan);
        } else {
          // URL where library was found
          var foundDiv = document.createElement("div");
          foundDiv.appendChild(document.createTextNode("Found in: "));
          var urlSpan = document.createElement("span");
          urlSpan.className = "url-chip";
          urlSpan.title = r.url;
          urlSpan.textContent = r.url;
          foundDiv.appendChild(urlSpan);
          tdInfo.appendChild(foundDiv);

          // Vulnerabilities
          if (r.vulnerabilities && r.vulnerabilities.length > 0) {
            r.vulnerabilities.forEach(function (v) {
              var vulnDiv = document.createElement("div");
              vulnDiv.className = "vuln-row";

              // Severity badge
              var sev = (v.severity || "unknown").toLowerCase();
              var badge = document.createElement("span");
              badge.className = "badge badge-" + sev;
              badge.textContent = v.severity || "Unknown";
              vulnDiv.appendChild(badge);

              // Identifiers (CVE / GHSA / etc.)
              if (v.identifiers) {
                var ids = [];
                Object.keys(v.identifiers).forEach(function (key) {
                  var val = v.identifiers[key];
                  if (Array.isArray(val)) {
                    ids = ids.concat(val);
                  } else {
                    ids.push(val);
                  }
                });
                if (ids.length > 0) {
                  var idDiv = document.createElement("div");
                  idDiv.className = "vuln-identifiers";
                  idDiv.textContent = ids.join(" · ");
                  vulnDiv.appendChild(idDiv);
                }
              }

              // Info links
              if (v.info && v.info.length > 0) {
                var linksDiv = document.createElement("div");
                linksDiv.className = "vuln-links";
                v.info.forEach(function (url, i) {
                  var a = document.createElement("a");
                  a.href = url;
                  a.title = url;
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  a.textContent = "[ref " + (i + 1) + "]";
                  linksDiv.appendChild(a);
                });
                vulnDiv.appendChild(linksDiv);
              }

              tdInfo.appendChild(vulnDiv);
            });
          }
        }

        tr.appendChild(tdInfo);
        resultsBody.appendChild(tr);
      });

      // Update stats
      if (vulnCountEl) vulnCountEl.textContent = vulnCount;
      if (libCountEl) libCountEl.textContent = libCount;

      // Show/hide table
      var hasVisible = res.length > 0;
      if (noResultsMsg) noResultsMsg.style.display = hasVisible ? "none" : "";
      if (resultsTable) resultsTable.style.display = hasVisible ? "" : "none";
    }

    function updatePageInfo() {
      if (!pageInfoEl) return;
      if (scannedPageUrl) {
        pageInfoEl.textContent = "Page: " + scannedPageUrl;
        pageInfoEl.title = scannedPageUrl;
        pageInfoEl.style.display = "";
      } else {
        pageInfoEl.textContent = "";
        pageInfoEl.title = "";
        pageInfoEl.style.display = "none";
      }
    }

    // ===== Generate and download HTML report =====
    // All colors are read live from the DOM's computed CSS variables — no duplication.
    // Changing a color in popup.html's :root or body.dark automatically reflects here.

    function generateReport(totalResults) {
      var now = new Date();
      var timestamp = now.toLocaleString();
      var dateStr = now.toISOString().slice(0, 10);

      // ── Read theme tokens from live CSS custom properties ──────────────────────────
      // Single source of truth: all values come from popup.html's :root / body.dark.
      // No isDark ternaries. No duplicated hex codes.
      var cs = getComputedStyle(document.body);
      function cv(n) {
        return cs.getPropertyValue(n).trim();
      }

      var pgBg = cv("--report-page-bg");
      var wrapperBg = cv("--report-wrapper-bg");
      var textColor = cv("--color-text");
      var textMuted = cv("--color-text-muted");
      var borderColor = cv("--color-border");
      var primaryCol = cv("--color-primary");
      var headerBg = cv("--header-bg"); // same gradient as popup header
      var thBg = cv("--report-th-bg");
      var linkColor = cv("--report-link-color");
      var rowVulnBg = cv("--color-danger-light");
      var rowUnknBg = cv("--color-unknown-light");

      var statusVulnBg = cv("--report-status-vuln-bg");
      var statusVulnText = cv("--report-status-vuln-text");
      var statusUnknBg = cv("--report-status-unkn-bg");
      var statusUnknText = cv("--report-status-unkn-text");
      var statusSafeBg = cv("--report-status-safe-bg");
      var statusSafeText = cv("--report-status-safe-text");

      // Severity badge color map — reads same vars as .badge-* CSS classes
      var sevBg = {
        critical: cv("--sev-critical-bg"),
        high: cv("--sev-high-bg"),
        medium: cv("--sev-medium-bg"),
        low: cv("--sev-low-bg"),
        unknown: cv("--sev-unknown-bg"),
      };
      var sevText = {
        critical: cv("--sev-critical-text"),
        high: cv("--sev-high-text"),
        medium: cv("--sev-medium-text"),
        low: cv("--sev-low-text"),
        unknown: cv("--sev-unknown-text"),
      };
      // ─────────────────────────────────────────────────────────────────────────────

      // Logo: use pre-fetched base64 icon if available, else no image
      var logoHtml = iconDataUrl
        ? '<img src="' +
          iconDataUrl +
          '" style="width:28px;height:28px;vertical-align:middle;margin-right:10px;border-radius:4px;" alt="retire.js pro">'
        : "";

      // Merge
      var merged = {};
      totalResults.forEach(function (rs) {
        if (!merged[rs.url]) merged[rs.url] = { url: rs.url, results: [] };
        merged[rs.url].results = merged[rs.url].results.concat(rs.results);
      });

      var res = [];
      Object.keys(merged).forEach(function (k) {
        var rs = merged[k];
        rs.results.forEach(function (r) {
          r.url = rs.url;
          r.vulnerable = r.vulnerabilities && r.vulnerabilities.length > 0;
        });
        if (rs.results.length === 0) {
          rs.results = [{ url: rs.url, unknown: true, component: "unknown" }];
        }
        res = res.concat(rs.results);
      });

      res.sort(function (x, y) {
        if (x.vulnerable !== y.vulnerable) return x.vulnerable ? -1 : 1;
        if (x.unknown !== y.unknown) return x.unknown ? 1 : -1;
        return (x.component + x.version).localeCompare(y.component + y.version);
      });

      var totalVuln = res.filter(function (r) {
        return r.vulnerable;
      }).length;
      var totalLibs = (function () {
        var s = {};
        res.forEach(function (r) {
          if (!r.unknown) s[(r.component || "") + "|" + (r.version || "")] = 1;
        });
        return Object.keys(s).length;
      })();

      // Build rows
      var rowsHtml = "";
      res.forEach(function (r) {
        var rowBg = r.vulnerable
          ? rowVulnBg
          : r.unknown
            ? rowUnknBg
            : "transparent";

        var statusHtml = r.vulnerable
          ? '<span style="background:' +
            statusVulnBg +
            ";color:" +
            statusVulnText +
            ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">VULNERABLE</span>'
          : r.unknown
            ? '<span style="background:' +
              statusUnknBg +
              ";color:" +
              statusUnknText +
              ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">UNKNOWN</span>'
            : '<span style="background:' +
              statusSafeBg +
              ";color:" +
              statusSafeText +
              ';padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">SAFE</span>';

        var urlHtml =
          '<a href="' +
          escapeHtml(r.url) +
          '" target="_blank" style="color:' +
          linkColor +
          ';font-family:monospace;font-size:11px;word-break:break-all;">' +
          escapeHtml(r.url) +
          "</a>";

        var vulnsHtml = "";
        if (r.vulnerabilities && r.vulnerabilities.length > 0) {
          r.vulnerabilities.forEach(function (v) {
            var sev = (v.severity || "unknown").toLowerCase();
            var bg = sevBg[sev] || sevBg["unknown"];
            var text = sevText[sev] || sevText["unknown"];

            var sevBadge =
              '<span style="background:' +
              bg +
              ";color:" +
              text +
              ';padding:1px 7px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase;">' +
              escapeHtml(v.severity || "Unknown") +
              "</span>";

            var ids = "";
            if (v.identifiers) {
              var idList = [];
              Object.keys(v.identifiers).forEach(function (key) {
                var val = v.identifiers[key];
                if (Array.isArray(val)) idList = idList.concat(val);
                else idList.push(val);
              });
              if (idList.length > 0) {
                ids =
                  '<span style="font-weight:700;font-size:11px;color:' +
                  textColor +
                  ';">' +
                  escapeHtml(idList.join(" · ")) +
                  "</span> ";
              }
            }

            var links = "";
            if (v.info && v.info.length > 0) {
              v.info.forEach(function (u, i) {
                links +=
                  '<a href="' +
                  escapeHtml(u) +
                  '" target="_blank" style="color:' +
                  primaryCol +
                  ';font-size:11px;margin-right:6px;">[ref ' +
                  (i + 1) +
                  "]</a>";
              });
            }

            vulnsHtml +=
              '<div style="margin-top:5px;padding-top:5px;border-top:1px dashed ' +
              borderColor +
              ';">' +
              sevBadge +
              " " +
              ids +
              links +
              "</div>";
          });
        }

        rowsHtml +=
          '<tr style="background:' +
          rowBg +
          ";border-bottom:1px solid " +
          borderColor +
          ';">' +
          '<td style="padding:10px;font-weight:600;font-size:12px;color:' +
          textColor +
          ';vertical-align:top;">' +
          escapeHtml(r.component || "—") +
          "</td>" +
          '<td style="padding:10px;font-family:monospace;font-size:11px;color:' +
          textMuted +
          ';vertical-align:top;">' +
          escapeHtml(r.version || "—") +
          "</td>" +
          '<td style="padding:10px;vertical-align:top;width:40%;">' +
          urlHtml +
          vulnsHtml +
          "</td>" +
          '<td style="padding:10px;vertical-align:top;">' +
          statusHtml +
          "</td>" +
          "</tr>";
      });

      // Scanned page URL in report header
      var scannedPageHtml = "";
      if (scannedPageUrl) {
        scannedPageHtml =
          '<p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Scanned page: ' +
          '<a href="' +
          escapeHtml(scannedPageUrl) +
          '" target="_blank" rel="noopener noreferrer" style="color:white;opacity:0.9;">' +
          escapeHtml(scannedPageUrl) +
          "</a></p>";
      }

      var html =
        "<!DOCTYPE html>\n" +
        '<html lang="en">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        "<title>Retire.js Pro — Scan Report</title>\n" +
        "<style>\n" +
        'body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;background:' +
        pgBg +
        ";color:" +
        textColor +
        ";}\n" +
        ".wrapper{max-width:900px;margin:40px auto;background:" +
        wrapperBg +
        ";border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}\n" +
        ".report-header{background:" +
        headerBg +
        ";color:white;padding:32px 36px;}\n" +
        ".report-header h1{margin:0 0 6px;font-size:24px;font-weight:800;display:flex;align-items:center;}\n" +
        ".report-header p{margin:0;font-size:13px;opacity:0.85;}\n" +
        ".stats{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid " +
        borderColor +
        ";}\n" +
        ".stat{padding:20px 24px;border-right:1px solid " +
        borderColor +
        ";text-align:center;}\n" +
        ".stat:last-child{border-right:none;}\n" +
        ".stat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:" +
        textMuted +
        ";margin-bottom:4px;}\n" +
        ".stat-num{font-size:28px;font-weight:800;}\n" +
        ".vuln-num{color:#e53e3e;} .lib-num{color:" +
        primaryCol +
        ";} .url-num{color:#38a169;}\n" +
        ".section-title{font-size:16px;font-weight:700;padding:20px 24px 12px;border-bottom:2px solid " +
        borderColor +
        ";color:" +
        textColor +
        ";}\n" +
        "table{width:100%;border-collapse:collapse;}\n" +
        "thead th{background:" +
        thBg +
        ";padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:" +
        textMuted +
        ";border-bottom:2px solid " +
        borderColor +
        ";}\n" +
        ".footer{padding:16px 24px;background:" +
        thBg +
        ";border-top:1px solid " +
        borderColor +
        ";font-size:11px;color:" +
        textMuted +
        ";text-align:center;}\n" +
        ".footer a{color:" +
        textMuted +
        ";text-decoration:none;}\n" +
        ".footer a:hover{text-decoration:underline;}\n" +
        "@media print{body{background:white;}.wrapper{box-shadow:none;margin:0;}}\n" +
        "</style>\n</head>\n<body>\n" +
        '<div class="wrapper">\n' +
        '<div class="report-header">' +
        "<h1>" +
        logoHtml +
        'Retire.JS<strong style="font-weight:900;">&nbsp;Pro&nbsp;</strong>&mdash; Scan Report</h1>' +
        "<p>Generated: " +
        escapeHtml(timestamp) +
        "</p>" +
        scannedPageHtml +
        "</div>\n" +
        '<div class="stats">' +
        '<div class="stat"><div class="stat-label">Vulnerabilities</div><div class="stat-num vuln-num">' +
        totalVuln +
        "</div></div>" +
        '<div class="stat"><div class="stat-label">Libraries Found</div><div class="stat-num lib-num">' +
        totalLibs +
        "</div></div>" +
        '<div class="stat"><div class="stat-label">URLs Scanned</div><div class="stat-num url-num">' +
        Object.keys(merged).length +
        "</div></div>" +
        "</div>\n" +
        '<div class="section-title">Detected Libraries &amp; Vulnerabilities</div>\n' +
        "<table>\n<thead><tr>" +
        "<th>Library</th><th>Version</th><th>URL &amp; Vulnerability Details</th><th>Status</th>" +
        "</tr></thead>\n<tbody>\n" +
        rowsHtml +
        "</tbody>\n</table>\n" +
        '<div class="footer">' +
        "retire.js pro v" +
        extVersion +
        " &mdash; Powered by the RetireJS vulnerability database&nbsp;" +
        ' <a href="https://github.com/silico-industries/retire.js-pro" target="_blank" rel="noopener noreferrer">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-github" viewBox="0 0 16 16">' +
        '  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"></path>' +
        "</svg>&nbsp; &nbsp;GitHub link 🔗</a>" +
        "</div>\n" +
        "</div>\n</body>\n</html>";

      var blob = new Blob([html], { type: "text/html; charset=utf-8" });
      var filename = "retire-js-pro-report-" + dateStr + ".html";
      var a = document.createElement("a");
      a.download = filename;
      a.href = window.URL.createObjectURL(blob);
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // ===== Utility: HTML escape =====
    function escapeHtml(str) {
      if (typeof str !== "string") return str;
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // ===== Utility: sendMessage =====
    function sendMessage(message, data, callback) {
      browser.runtime.sendMessage(
        {
          to: "background",
          message: message,
          data: data,
        },
        function (response) {
          if (callback) callback(response);
        },
      );
    }
  },
  false,
);

// FIX-1: Remove prototype pollution — replaced with local helper functions
function mapOwnProperty(obj, f) {
  var results = [];
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) results.push(f(obj[i], i));
  }
  return results;
}

function flattenArray(arr) {
  return arr.reduce(function (a, b) {
    return a.concat(b);
  }, []);
}
