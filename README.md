# sw + streams + iframe

## Run (requires java >= 11)
> java Server.java

**Navigate to:** 
localhost:10000

## What is this all about?

service worker + writable streams is a useful mechanism to load generated/decrypted content in response to a request

This is demonstrated on index.html whereby the request to play/seek the video is intercepted via a service worker and data retrieved in main.js.

A writable stream is setup between main.js and sw.js and pipes the data back to the service worker. 


## Sandboxed iframe

To take this one step further, In chrome and firefox (but not safari) it is possible to load content into an iframe inside an iframe via a similar mechanism.

The purpose is to have the inner iframe on a subdomain subdomain.domain.com to provide a secure sandbox to load arbitrary html.

The java classes provide a minimal web server that sets additional response headers (ie COOP, COEP, CORP)


## Structure

main.js constructs an iframe and adds it to index.html.

The .src is set to /apps/sandbox/sandbox.html which contains the inner iframe.

The associated file sandbox.js loads a service worker to intercept requests.

And like the video streaming example, the data is ultimately loaded from main.js.

## Safari issues

1. subdomain.localhost:10000 is not supported ([webkit bug](https://bugs.webkit.org/show_bug.cgi?id=160504) from 2016, workaround - deploy to a remote host)
2. the iframe inside an iframe does not work. nothing in console to indicate what the problem is.

Note: due to the minimal nature of this example - you will need to clear the cache/hard reset each time loading index.html


Alternative method (doesn't require the hard reset - but is the full app and therefore much more code):

1. Create an account on peergos-demo.net
2. upload a minimal .html file
3. view the html file in the in-built html viewer (view action available from right-click menu)

The file will be viewable in chrome and firefox, but not safari.

Please make sure that you are not in incognito mode.
