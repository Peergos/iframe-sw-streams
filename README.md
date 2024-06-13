# service worker + streams + iframe + credentialless

This demonstrates a difference in behaviour between chrome and firefox/safari 

To try it out visit [https://credentialless.peergos.com/](https://credentialless.peergos.com/) or run it on localhost.

## Run (requires java >= 11)
> java Server.java

**Navigate to:** 
localhost:10000


## Sandboxed iframe

The purpose is to have the inner iframe on a subdomain subdomain.domain.com to provide a secure sandbox to load arbitrary html.

The file Server.java provides a minimal web server that sets additional response headers (ie COOP, COEP, CORP) and is directly executable without compilation.


## Structure

main.js constructs an iframe and adds it to index.html.

The .src is set to /apps/sandbox/sandbox.html which contains the inner iframe.

The associated file sandbox.js loads a service worker to intercept requests.


## Chrome issue

If I check crossOriginIsolated inside the sandboxed iframe it is set to FALSE
In Safari and firefox it is set to TRUE.

The fact that it is FALSE means I cannot host multi-threaded WASM code in the sandbox as SharedArrayBuffer is only available if crossOriginIsolated=TRUE

Alternative method to demonstrate issue

1. Create an account on peergos-demo.net
2. upload a minimal .html file with code:

```

<!DOCTYPE html>
<html lang="en">
        <body>
            <h2>Hello World!</h2>
	        <label id="inside-isolatedIFrame"></label>
        </body>
    <script>
        window.onload = function() {
            document.getElementById("inside-isolatedIFrame").innerText = "Inside - Cross Origin Isolated: " + crossOriginIsolated;
        }
    </script>
</html>

```

3. view the html file in the in-built html viewer (view action available from right-click menu)

