var isIframeInitialised = false;
let appName = 'demo';
let indexHTML = appName + "/index.html";
let GET_SUCCESS = 8;

function frameUrl() {
    let url= this.frameDomain() + "/apps/sandbox/sandbox.html";
    return url;
}
function frameDomain() {
    return window.location.protocol + "//sandbox." + window.location.host;
}
function giveUp() {
    console.log('Your Web browser does not support sandbox applications :(');
}
function postMessage(obj) {
    let iframe = document.getElementById("sandboxId");
    iframe.contentWindow.postMessage(obj, '*');
}
function messageHandler(e) {
    let that = this;
    let iframe = document.getElementById("sandboxId");
    if ((e.origin === "null" || e.origin === that.frameDomain()) && e.source === iframe.contentWindow) {
        if (e.data.action == 'pong') {
            that.isIframeInitialised = true;
        } else if (e.data.action == 'failedInit') {
            that.giveUp();
        } else if(e.data.action == 'actionRequest') {
            that.actionRequest(e.data.filePath, e.data.requestId, e.data.apiMethod, e.data.bytes, e.data.hasFormData);
        }
    }
}
function startListener() {
    var that = this;
    var iframe = document.getElementById("sandboxId");
    if (iframe == null) {
        setTimeout(() => {that.startListener();}, 100);
        return;
    }
    // Listen for response messages from the frames.
    window.removeEventListener('message', that.messageHandler);
    window.addEventListener('message', that.messageHandler);
    let func = function() {
        that.postMessage({type: 'init', appName: appName, indexHTML: indexHTML});
    };
    setupIFrameMessaging(iframe, func);
}
function setupIFrameMessaging(iframe, func) {
    if (this.isIframeInitialised) {
        func();
    } else {
        iframe.contentWindow.postMessage({type: 'ping'}, '*');
        let that = this;
        window.setTimeout(function() {that.setupIFrameMessaging(iframe, func);}, 30);
    }
}

function buildHeader(filePath, mimeType, requestId) {
	let encoder = new TextEncoder();
	let filePathBytes = encoder.encode(filePath);
	let mimeTypeBytes = encoder.encode(mimeType);
	let pathSize = filePathBytes.byteLength;
	let mimeTypeSize = mimeTypeBytes.byteLength;
	const headerSize = 1 + 1 + pathSize + 1 + mimeTypeSize;
	var data = new Uint8Array(headerSize);
	data.set(0, 0); //return status code
	data.set([pathSize], 1);
	data.set(filePathBytes, 2);
	data.set([mimeTypeSize], 2 + pathSize);
	data.set(mimeTypeBytes, 2 + pathSize + 1);
    return data;
}
function buildResponse(header, body, mode) {
    var bytes = body == null ? new Uint8Array(header.byteLength)
                : new Uint8Array(body.byteLength + header.byteLength);
    for(var i=0;i < header.byteLength;i++){
        bytes[i] = header[i];
    }
    if (body != null) {
        for(var j=0;j < body.byteLength;j++){
            bytes[i+j] = body[j];
        }
    }
    bytes[0] = mode;
    postMessage({type: 'respondToLoadedChunk', bytes: bytes});
}
function actionRequest(filePath, requestId, apiMethod, data, hasFormData) {
    if (apiMethod == 'GET') {
    	    fetch(filePath).then(res => {
        		res.arrayBuffer().then(buf => {
        	    	let data =  new Uint8Array(buf);
        	    	let mimeType = filePath.endsWith(".png") ? "image/png" : "text/html";
                    let header = buildHeader(filePath, mimeType, requestId);
		            buildResponse(header, data, GET_SUCCESS);
        		});
            });
    } else {
        console.log('N/A for now');
    }
}
window.onload = function() {
    document.getElementById("isolated-outside").innerText = "Outside - Cross Origin Isolated: " + crossOriginIsolated;
    let iframe = document.getElementById("sandboxId");
    iframe.src = frameUrl();
    startListener();
}
