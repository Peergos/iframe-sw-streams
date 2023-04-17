var mainWindow;
var origin;
var streamWriter;
let handler = function (e) {
      // You must verify that the origin of the message's sender matches your
      // expectations. In this case, we're only planning on accepting messages
      // from our own origin, so we can simply compare the message event's
      // origin to the location of this document. If we get a message from an
      // unexpected host, ignore the message entirely.
      let parentDomain = window.location.host.substring(window.location.host.indexOf(".")+1)
      if (e.origin !== (window.location.protocol + "//" + parentDomain))
          return;
      mainWindow = e.source;
      origin = e.origin;

      if (e.data.type == "ping") {
        mainWindow.postMessage({action:'pong'}, e.origin);
      } else if (e.data.type == "init") {
          load(e.data.appName, e.data.indexHTML);
      } else if(e.data.type == "respondToLoadedChunk") {
        respondToLoadedChunk(e.data.bytes);
      }
};
window.addEventListener('message', handler);

function actionRequest(filePath, requestId, apiMethod, bytes, hasFormData) {
    mainWindow.postMessage({action:'actionRequest', requestId: requestId, filePath: filePath, apiMethod: apiMethod,
    bytes: bytes, hasFormData: hasFormData}, origin);
}
function load(appName, indexHTML) {
    let that = this;
    let fileStream = streamSaver.createWriteStream(appName, "text/html", url => {
        let iframe = document.getElementById("appId");
            iframe.src= indexHTML;
        }, function(seekHi, seekLo, seekLength, streamFilePath){
                //todo
        }, 0
        ,function(filePath, requestId, apiMethod, bytes, hasFormData){
            that.actionRequest(filePath, requestId, apiMethod, bytes, hasFormData);
        }
    );
    that.streamWriter = fileStream.getWriter();
}	
function respondToLoadedChunk(bytes) {
    streamWriter.write(bytes);
}
