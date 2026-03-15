(function() {
    var count = 0;
    var totalResults = [];
    browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.message) {
            var result = JSON.parse(request.message);
            totalResults.push(result);
            if (result.vulnerable) {
                count++;
                sendResponse({
                    'count': count
                });
                var out = [];
                result.results.forEach(function(r) {
                    r.vulnerabilities = r.vulnerabilities || [];
                    out.push(r.component + " " + r.version + " - Info: " +
                        r.vulnerabilities.map(function(i) {
                            return i.info
                        }).reduce((a, b) => a.concat(b), []).join(" ")); // FIX-1: Replaced .flatten() with inline reduce
                })
                // console.log("Loaded script with known vulnerabilities: " + result.url + "\n - " + out.join("\n - "));
            }
        } else if (request.getDetected) {
            sendResponse(totalResults);
        }
        return true;
    });
})();

function flattenArray(arr) {
    return arr.reduce((a, b) => a.concat(b), []);
}
