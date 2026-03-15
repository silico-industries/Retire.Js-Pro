var extension = null;
window.addEventListener("message", function orig(evt) {
	// FIX-3: Validate message origin - accept extension origin or null (sandboxed iframe)
	if (!evt.origin.startsWith('moz-extension://') && evt.origin !== 'null') return;
	if (evt.data.repoFuncs) {
		extension = evt.source;
		var iframe = document.createElement("iframe");
		iframe.retireEvent = evt;
		iframe.src = "inner-sandbox.html";
		iframe.style = "visibility: hidden";
		iframe.setAttribute('sandbox', 'allow-scripts'); // FIX-2: Enable script evaluation in sandbox
		document.body.appendChild(iframe);
		setTimeout(function() {
			iframe.contentWindow.postMessage(evt.data, "*");
		}, 200);
		setTimeout(function() {
			iframe.remove();
		}, 5000);
	} else if (evt.data.version){
		extension.postMessage(evt.data, "*");
	}
});