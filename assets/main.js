let allFiles = {};
let allMimeTypes = {};
let prefix = "app";
let resourcesToLoad = 2;
let videoFilename = "sintel_trailer-1080p.mp4";

let isIframeInitialised = false;

let appName = 'demo';
let indexHTML = appName + "/index.html";

let GET_SUCCESS = 8;

function loadPageContent() {
    let encoder = new TextEncoder();
    let pageContent = document.getElementById("pageContent").value;
    let defaultIndexPageData = encoder.encode(pageContent);
    let pageKey = appName + "/index.html";
    allFiles[pageKey] = new Uint8Array(defaultIndexPageData);
    allMimeTypes[pageKey] = "text/html";
}

function setupData() {
	loadPageContent();
    loadResource("logo.png", "image/png");
    loadResource(videoFilename, "video/mp4");
}

function loadResource(filename, mimeType) {
    fetch(filename).then(res => {
		res.arrayBuffer().then(buf => {
	    	let key = appName + "/" + filename;
	    	allFiles[key] = new Uint8Array(buf);
	    	allMimeTypes[key] = mimeType;
	    	resourcesToLoad--;
	    	if (resourcesToLoad == 0) {
    			setupVideoStreaming();
    			let reloadBtn = document.getElementById("reloadIframe");
    			reloadBtn.innerText = 'Load content';
			    reloadBtn.onclick = loadContent;
	    	}
		});
    });
}

function setupVideoStreaming() {
    console.log("setup Video Streaming!");
    let filename = videoFilename;
    let key = appName + "/" + filename;
    var fileData = allFiles[key];
    var mimeType = allMimeTypes[key];
    var size = fileData.byteLength;

    function Context() {
		this.maxBlockSize = 1024 * 1024 * 5;
		this.writer = null;
		this.stream = function (seekHi, seekLo, length) {
	    	var work = function (thatRef) {
				var currentSize = length;
				var blockSize = currentSize > thatRef.maxBlockSize ? thatRef.maxBlockSize: currentSize;
				var startOffset = seekLo;
            	var sizeCountDown = length;

				var pump = function () {
		    		if (blockSize > 0) {
						var data = new Uint8Array(blockSize);
						let slicedData = fileData.slice(startOffset, startOffset + blockSize);
                		data.set(slicedData);
                    	startOffset = startOffset  +  blockSize;
                    	sizeCountDown = sizeCountDown - blockSize;

						blockSize = sizeCountDown > thatRef.maxBlockSize ? thatRef.maxBlockSize : sizeCountDown;
						thatRef.writer.write(data);
						pump();
		    		}
				};
				pump();
	    	};
	    	var empty = new Uint8Array(0);
	    	this.writer.write(empty);
	    	work(this);
		};
    }
    const context = new Context();
    console.log("streaming data of length " + size);
    let that = this;
    let fileStream = streamSaver.createWriteStream("media-" + filename, mimeType,
		function (url) {
			let video = document.getElementById("videoElement");
			video.src = url;
		},
		function (seekHi, seekLo, seekLength) {
			context.stream(seekHi, seekLo, seekLength);
		}, undefined, size);
    context.writer = fileStream.getWriter();
}
function loadContent() {
    console.log("loading Content!");
    document.getElementById("reloadIframe").disabled = true;
    var iframe = document.getElementById("sandboxId");
    if (iframe != null) {
        iframe.parentNode.removeChild(iframe);
    }        
    isIframeInitialised = false;
    
    var iframeContainer = document.getElementById("iframe-container");
    iframe = document.createElement('iframe');
	iframe.id = 'sandboxId';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.frameBorder="0";
    iframe.scrolling="no";
    iframeContainer.appendChild(iframe);

    let src = frameUrl();
    setTimeout(() => {
	    iframe.src = src;
    }, 1000);
	startListener();
}
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

function buildHeader(filePath, requestId) {
	let mimeType = allMimeTypes[filePath];
	let encoder = new TextEncoder();
	let filePathBytes = encoder.encode(filePath);
	let mimeTypeBytes = encoder.encode(mimeType);
	let pathSize = filePathBytes.byteLength;
	let mimeTypeSize = mimeTypeBytes.byteLength;
	const headerSize = 1 + 1 + pathSize + 1 + mimeTypeSize;
	var data = new Uint8Array(headerSize);
	data.set(0, GET_SUCCESS);
	data.set([pathSize], 1);
	data.set(filePathBytes, 2);
	data.set([mimeTypeSize], 2 + pathSize);
	data.set(mimeTypeBytes, 2 + pathSize + 1);
    return data;
}
function buildResponse(header, body) {
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
    postMessage({type: 'respondToLoadedChunk', bytes: bytes});
}
function actionRequest(filePath, requestId, apiMethod, data, hasFormData) {
    let header = buildHeader(filePath, requestId);
    if (apiMethod == 'GET') {
    	var data = allFiles[filePath];
		buildResponse(header, data);
    } else {
        console.log('N/A for now');
    }
}

window.onload = function() {
    setupData();
}
