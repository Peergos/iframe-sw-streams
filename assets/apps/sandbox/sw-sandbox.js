var streamingMap

let appToken = "app/";
var appData = null;
var appPort = null;

var downloadUrl = null;
let appName = null;

self.onmessage = event => {
  if (event.data === 'ping') {
    return
  }

  downloadUrl = self.registration.scope + 'intercept-me-nr' + Math.random()
  const data = event.data
  const port = event.ports[0]

  const metadata = new Array(3) // [stream, data, port]
  metadata[1] = data
  metadata[2] = port
  
  let headers = new Headers(data.headers || {})

  let size = Number(headers.get('Content-Length'));
  let disposition = headers.get('Content-Disposition');
  let startIndex = disposition.indexOf("''");
  appName = disposition.substring(startIndex+2, disposition.length);
  setupNewApp(port);
  port.postMessage({ download: downloadUrl})

}

function AppData() {
    this.resultMap = new Map();
    this.fileMap = new Map();
    this.mimeTypeMap = new Map();
    this.fileStatusMap = new Map();
    this.isReady = function(fullPath) {
        var status = this.fileStatusMap.get(fullPath)
        return status == true;
    }
    this.getAndRemoveFile = function(fullPath) {
        let fileData = this.fileMap.get(fullPath);
        let mimeType = this.mimeTypeMap.get(fullPath);
        let result = this.resultMap.get(fullPath);

        this.resultMap.delete(fullPath);
        this.fileMap.delete(fullPath);
        this.mimeTypeMap.delete(fullPath);
        this.fileStatusMap.delete(fullPath);
        return {file: fileData, mimeType: mimeType, statusCode: result};
    }
    this.convertStatusCode = function(code) {
        if (code == '0') {        //              APP_FILE_MODE = 0
            return 200;
        } else if (code == '8') { //            GET_SUCCESS: 8,
            return 200;
        } else {
            return 400;
        }
    }
    this.enqueue = function(moreData) {
    	let code = moreData[0];
        var offset = 1;
        let filePathSize = moreData[offset];
        var offset = offset + 1;
        let filePathBytes = moreData.subarray(offset, filePathSize + offset);
        let filePath = new TextDecoder().decode(filePathBytes);

        offset =  offset + filePathSize;
        let mimeTypeSize = moreData[offset];
        offset = offset + 1;
        let mimeTypeBytes = moreData.subarray(offset, mimeTypeSize + offset);
        let mimeType = new TextDecoder().decode(mimeTypeBytes);
        offset =  offset + mimeTypeSize;

        this.mimeTypeMap.set(filePath, mimeType);
        this.resultMap.set(filePath, this.convertStatusCode(code));

        var file = this.fileMap.get(filePath)
        if(file == null) {
            file = new Uint8Array(0);
        }
        const combinedSize = file.byteLength + moreData.byteLength - offset;
        var newFile = new Uint8Array(combinedSize);
        newFile.set(file);
        newFile.set(moreData.subarray(offset), file.byteLength);
        this.fileMap.set(filePath, newFile);
        this.fileStatusMap.set(filePath, true);
    }
}
function setupNewApp(port) {
    appData = new AppData();
    appPort = port;
    port.onmessage = ({ data }) => {
        if (data != 'end' && data != 'abort') {
            appData.enqueue(data)
        }
    }
}

self.addEventListener('install', event =>  {
    self.skipWaiting();
});
self.addEventListener('activate', event => {
    clients.claim();
});

self.onfetch = event => {
    const url = event.request.url;
    console.log("url=" + url);
    if (url.endsWith('/ping')) {
      return event.respondWith(new Response('pong', {
        headers: { 'Access-Control-Allow-Origin': '*' }
      }));
    }
    if (appPort == null) {
        return;
    }
    if (url == downloadUrl) {
      return event.respondWith(new Response('', {
            headers: [
                //['Access-Control-Allow-Origin', '*'],
                ['Cross-Origin-Embedder-Policy', 'credentialless'],
                ['Cross-Origin-Opener-Policy', 'same-origin'],
                ['Cross-Origin-Resource-Policy', 'same-origin'],
                ['Access-Control-Allow-Origin', '*'],
            ]
      }))
    }
    const requestedResource = new URL(url)
    let prefix = '/apps/sandbox/';
    var filePath = requestedResource.pathname.substring(prefix.length);
    let method = event.request.method;
    if (method != 'GET') {
        return event.respondWith(new Response('Not Implemented!', {
            status: 400
        }));
    } else {
        var restFilePath = filePath;
        return event.respondWith(
            (async function() {
                appPort.postMessage({ filePath: restFilePath, requestId: '', apiMethod: method, bytes: null, hasFormData: false});
                return returnAppData(restFilePath);
            })()
        )
    }
}
function returnAppData(filePath) {
    return new Promise(function(resolve, reject) {
        let key = filePath;
        let pump = () => {
            if (!appData.isReady(key)) {
                setTimeout(pump, 100)
            } else {
                let fileData = appData.getAndRemoveFile(key)
                resolve(fileData);
            }
        }
        pump()
    }).then(function(fileData, err) {
        return new Response(fileData.file.byteLength == 0 ? null : fileData.file, {
            status: fileData.statusCode,
            headers: [
                ['Content-Type', fileData.mimeType],
                ['Content-Length', fileData.file.byteLength],
                ['Cross-Origin-Embedder-Policy', 'credentialless'],
                ['Cross-Origin-Opener-Policy', 'same-origin'],
                ['Cross-Origin-Resource-Policy', 'same-origin'],
                ['Access-Control-Allow-Origin', '*'],
            ]
        });
    });
}