import com.sun.net.httpserver.*;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.*;
import java.util.zip.*;

public class Server {

    public static void main(String[] args) throws IOException {
        int port = 10000;
        InetSocketAddress local = new InetSocketAddress("localhost", port);
        int connectionBacklog = 100;
        HttpServer localhostServer = HttpServer.create(local, connectionBacklog);
        CspHost host = new CspHost("http://", local.getHostName(), local.getPort());
        List<String> frameDomains = Arrays.asList();
        List<String> appSubdomains = Arrays.asList("sandbox");
        StaticHandler handler = new FileHandler(host, Collections.emptyList(), frameDomains, appSubdomains, Paths.get("assets"), true, true);

        List<String> allowedHosts = Arrays.asList("127.0.0.1:" + local.getPort(), host.host());
        SubdomainHandler subdomainHandler = new SubdomainHandler(allowedHosts, handler, true);
        localhostServer.createContext("/", subdomainHandler);

        localhostServer.setExecutor(Executors.newFixedThreadPool(10));
        localhostServer.start();
        System.out.println("Cacheless Server listening on http://localhost:" + port);
    }

    public static abstract class StaticHandler implements HttpHandler
    {
        private final boolean isGzip;
        private final boolean includeCsp;
        private final CspHost host;
        private final List<String> blockstoreDomain;
        private final List<String> frameDomains;
        private final Map<String, String> appDomains;

        public StaticHandler(CspHost host,
                             List<String> blockstoreDomain,
                             List<String> frameDomains,
                             List<String> appSubdomains,
                             boolean includeCsp,
                             boolean isGzip) {
            this.host = host;
            this.includeCsp = includeCsp;
            this.blockstoreDomain = blockstoreDomain;
            this.frameDomains = frameDomains;
            this.appDomains = appSubdomains.stream()
                    .collect(Collectors.toMap(s -> s + "." + host.domain + host.port.map(p -> ":" + p).orElse(""), s -> s));
            this.isGzip = isGzip;
        }

        public abstract Asset getAsset(String resourcePath) throws IOException;

        public class Asset {
            public final byte[] data;
            public final String hash;

            public Asset(byte[] data) {
                this.data = data;
                byte[] digest = sha256(data);
                this.hash = bytesToHex(Arrays.copyOfRange(digest, 0, 8));
            }
        }

        protected boolean isGzip() {
            return isGzip;
        }

        @Override
        public void handle(HttpExchange httpExchange) throws IOException {
            String path = httpExchange.getRequestURI().getPath();
            try {
                path = path.substring(1);
                path = path.replaceAll("//", "/");
                if (path.length() == 0)
                    path = "index.html";

                boolean isRoot = path.equals("index.html");
                Asset res = getAsset(path);

                if (isGzip)
                    httpExchange.getResponseHeaders().set("Content-Encoding", "gzip");
                if (path.endsWith(".js"))
                    httpExchange.getResponseHeaders().set("Content-Type", "text/javascript");
                else if (path.endsWith(".html"))
                    httpExchange.getResponseHeaders().set("Content-Type", "text/html");
                else if (path.endsWith(".css"))
                    httpExchange.getResponseHeaders().set("Content-Type", "text/css");
                else if (path.endsWith(".json"))
                    httpExchange.getResponseHeaders().set("Content-Type", "application/json");
                else if (path.endsWith(".png"))
                    httpExchange.getResponseHeaders().set("Content-Type", "image/png");
                else if (path.endsWith(".woff"))
                    httpExchange.getResponseHeaders().set("Content-Type", "application/font-woff");
                else if (path.endsWith(".svg"))
                    httpExchange.getResponseHeaders().set("Content-Type", "image/svg+xml");


                if (httpExchange.getRequestMethod().equals("HEAD")) {
                    httpExchange.getResponseHeaders().set("Content-Length", "" + res.data.length);
                    httpExchange.sendResponseHeaders(200, -1);
                    return;
                }
                if (! isRoot) {
                    httpExchange.getResponseHeaders().set("Cache-Control", "public, max-age=3600");
                    httpExchange.getResponseHeaders().set("ETag", res.hash);
                }

                String reqHost = httpExchange.getRequestHeaders().get("Host").stream().findFirst().orElse("");
                boolean isSubdomain = appDomains.containsKey(reqHost);
                // subdomains and only subdomains can access apps/ files
                String app = appDomains.get(reqHost);
                if (isSubdomain ^ path.startsWith("apps/" + app)) {
                    System.err.println("404 FileNotFound: " + path);
                    httpExchange.sendResponseHeaders(404, 0);
                    httpExchange.getResponseBody().close();
                    return;
                }

                // Only allow assets to be loaded from the original host
                // Todo work on removing unsafe-inline from sub domains
                if (includeCsp)
                    httpExchange.getResponseHeaders().set("content-security-policy", "default-src 'self' " + this.host + ";" +
                            "style-src 'self' " +
                            " " + this.host +
                            (isSubdomain ? " 'unsafe-inline' https://" + reqHost : "") + // calendar, code-editor, etc
                            ";" +
                            (isSubdomain ? "sandbox allow-same-origin allow-scripts allow-forms;" : "") +
                            "frame-src 'self' " + frameDomains.stream().collect(Collectors.joining(" ")) + " " + (isSubdomain ? "" : this.host.wildcard()) + ";" +
                            "frame-ancestors 'self' " + this.host + ";" +
                            "prefetch-src 'self' " + this.host + ";" + // prefetch can be used to leak data via DNS
                            "connect-src 'self' " + this.host +
                            (isSubdomain ? "" : blockstoreDomain.stream().map(d -> " https://" + d).collect(Collectors.joining())) + ";" +
                            "media-src 'self' " + this.host + " blob:;" +
                            "img-src 'self' " + this.host + " data: blob:;" +
                            "object-src 'none';"
                    );
                // Enable COEP, CORP, COOP
                httpExchange.getResponseHeaders().set("Cross-Origin-Embedder-Policy", "require-corp");
                System.out.println("served " + path + " with CORP " + (isSubdomain ? "cross-origin" : "same-origin"));
                httpExchange.getResponseHeaders().set("Cross-Origin-Resource-Policy", isSubdomain ? "cross-origin" : "same-origin");
                httpExchange.getResponseHeaders().set("Cross-Origin-Opener-Policy", "same-origin");

                // Request same site, cross origin isolation
                httpExchange.getResponseHeaders().set("Origin-Agent-Cluster", "?1");

                // Don't let anyone to load main site in an iframe (legacy header)
                if (!isSubdomain)
                    httpExchange.getResponseHeaders().set("x-frame-options", "sameorigin");
                // Enable cross site scripting protection
                httpExchange.getResponseHeaders().set("x-xss-protection", "1; mode=block");
                // Disable prefetch which can be used to exfiltrate data cross domain
                httpExchange.getResponseHeaders().set("x-dns-prefetch-control", "off");
                // Don't let browser sniff mime types
                httpExchange.getResponseHeaders().set("x-content-type-options", "nosniff");
                // Don't send Peergos referrer to anyone
                httpExchange.getResponseHeaders().set("referrer-policy", "no-referrer");
                // allow list of permissions
                httpExchange.getResponseHeaders().set("permissions-policy",
                        "geolocation=(), gyroscope=(), magnetometer=(), accelerometer=(), microphone=(), " +
                                "camera=(self), fullscreen=(self)");
                if (! isRoot) {
                    String previousEtag = httpExchange.getRequestHeaders().getFirst("If-None-Match");
                    if (res.hash.equals(previousEtag)) {
                        httpExchange.sendResponseHeaders(304, -1); // NOT MODIFIED
                        return;
                    }
                }

                httpExchange.sendResponseHeaders(200, res.data.length);
                httpExchange.getResponseBody().write(res.data);
                httpExchange.getResponseBody().close();
            } catch (Throwable t) {
                System.err.println("404 FileNotFound: " + path);
                httpExchange.sendResponseHeaders(404, 0);
                httpExchange.getResponseBody().close();
            }
        }

        private static final String[] HEX_DIGITS = new String[]{
                "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"};
        private static final String[] HEX = new String[256];
        static {
            for (int i=0; i < 256; i++)
                HEX[i] = HEX_DIGITS[(i >> 4) & 0xF] + HEX_DIGITS[i & 0xF];
        }

        public static String byteToHex(byte b) {
            return HEX[b & 0xFF];
        }

        public static String bytesToHex(byte[] data) {
            StringBuilder s = new StringBuilder();
            for (byte b : data)
                s.append(byteToHex(b));
            return s.toString();
        }

        public static byte[] sha256(byte[] input) {
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                md.update(input);
                return md.digest();
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }

        protected static byte[] readResource(InputStream in, boolean gzip) throws IOException {
            ByteArrayOutputStream bout = new ByteArrayOutputStream();
            OutputStream gout = gzip ? new GZIPOutputStream(bout) : new DataOutputStream(bout);
            byte[] tmp = new byte[4096];
            int r;
            while ((r=in.read(tmp)) >= 0)
                gout.write(tmp, 0, r);
            gout.flush();
            gout.close();
            in.close();
            return bout.toByteArray();
        }
    }

    public static class FileHandler extends StaticHandler
    {
        private final Path root;
        public FileHandler(CspHost host,
                           List<String> blockstoreDomain,
                           List<String> frameDomains,
                           List<String> appSubdomains,
                           Path root,
                           boolean includeCsp,
                           boolean isGzip) {
            super(host, blockstoreDomain, frameDomains, appSubdomains, includeCsp, isGzip);
            this.root = root;
        }

        @Override
        public Asset getAsset(String resourcePath) throws IOException {
            String stem = resourcePath.startsWith("/")  ?  resourcePath.substring(1) : resourcePath;
            Path fullPath = root.resolve(stem);
            byte[] bytes = readResource(new FileInputStream(fullPath.toFile()), isGzip());
            return new Asset(bytes);
        }
    }

    public static class SubdomainHandler implements HttpHandler
    {
        private final List<String> domains;
        private final HttpHandler handler;
        private final boolean allowSubdomains;

        public SubdomainHandler(List<String> domains, HttpHandler handler, boolean allowSubdomains) {
            this.domains = domains;
            this.handler = handler;
            this.allowSubdomains = allowSubdomains;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            List<String> hostHeaders = exchange.getRequestHeaders().get("Host");
            if (hostHeaders.isEmpty() || (hostHeaders.size() == 1 &&
                    domains.contains(hostHeaders.get(0)))) {
                handler.handle(exchange);
            } else if (allowSubdomains && hostHeaders.size() == 1 &&
                    domains.stream().anyMatch(d -> hostHeaders.get(0).endsWith(d))) {
                handler.handle(exchange);
            } else {
                System.err.println("Subdomain access blocked: " + hostHeaders + " not in " + String.join(",", domains));
                exchange.sendResponseHeaders(404, 0);
                exchange.close();
            }
        }
    }


    public static class CspHost {

        public final Optional<String> protocol;
        public final String domain;
        public final Optional<Integer> port;

        public CspHost(Optional<String> protocol, String domain, Optional<Integer> port) {
            if (protocol.isPresent() && ! protocol.get().equals("http://") && ! protocol.get().equals("https://"))
                throw new IllegalStateException("Protocol must be http:// or https://");
            this.protocol = protocol;
            this.domain = domain;
            if (port.isPresent() && port.map(p -> p < 0 || p >= 65536).get())
                throw new IllegalStateException("Invalid port " + port.get());
            this.port = port;
        }

        public CspHost(String protocol, String domain) {
            this(Optional.of(protocol), domain, Optional.empty());
        }

        public CspHost(String protocol, String domain, int port) {
            this(Optional.of(protocol), domain, Optional.of(port));
        }

        public CspHost wildcard() {
            return new CspHost(protocol, "*." + domain, port);
        }

        public String host() {
            return domain + port.map(p -> ":" + p).orElse("");
        }

        @Override
        public String toString() {
            return protocol.orElse("") + domain + port.map(p -> ":" + p).orElse("");
        }
    }
}