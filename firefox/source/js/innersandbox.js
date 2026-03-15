var realwin = window;
var realdoc = document;
window.addEventListener("message", function(evt) {
    //console.log('inner', evt, evt.data);
    // FIX-3: Validate message origin - accept extension origin or null (sandboxed iframe)
    if (!evt.origin.startsWith('moz-extension://') && evt.origin !== 'null') return;
    if (!evt.data.script) return evt.source.postMessage({ done : "true"}, "*");
    var repoFuncs = evt.data.repoFuncs;
    //try {
        ['alert', 'prompt', 'confirm'].forEach(function(n) {
            try {
                Object.defineProperty(window, n, {
                    get: function() { return function() {} },
                    set: function() { },
                    enumerable: true,
                    configurable: false
                });
            } catch(e) {}
        });

        //Make sure other scripts are loaded correctly
        if (evt.data.url) {
            document.getElementsByTagName("base")[0].setAttribute("href", evt.data.url.replace(/(https?:\/\/[^\/]+).*/, "$1/"));
        }

        // FIX-2: Evaluate the script content to populate global scope
		try {
			new Function(evt.data.script)();
		} catch(e) {
			// Script evaluation failed, but continue with extractors anyway
		}

		// FIX-2: Run actual extractor functions instead of overwriting them
		for(var component in repoFuncs) {
		    repoFuncs[component].forEach(function(extractorFunc) {
		        try {
		            // FIX-2: Evaluate the extractor function string to get the actual function
		            var func = new Function('return ' + extractorFunc + ';')();
		            var result = func();
		            evt.source.postMessage({ component : component, version : result, original: evt.data }, "*");
		        } catch(e) {
		        }
		    });
		}
    /*} catch(e) {
        console.warn(e);
    }*/
    evt.source.postMessage({ done : "true"}, "*");
});
