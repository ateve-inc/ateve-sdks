package ai.ateve;

import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tiny scriptable mock of POST /v1/search built on the JDK HttpServer.
 * Enqueue responses; they are served in order, the last one repeating.
 */
final class MockApi implements AutoCloseable {

    static final class Scripted {
        final int status;
        final String body;
        final Map<String, String> headers;
        final long delayMillis;

        Scripted(int status, String body, Map<String, String> headers, long delayMillis) {
            this.status = status;
            this.body = body;
            this.headers = headers;
            this.delayMillis = delayMillis;
        }
    }

    private final HttpServer server;
    private final List<Scripted> script = new ArrayList<>();
    private final AtomicInteger hits = new AtomicInteger();
    final List<String> receivedBodies = new ArrayList<>();
    final List<String> receivedAuthHeaders = new ArrayList<>();
    final List<String> receivedUserAgents = new ArrayList<>();

    private final java.util.concurrent.ExecutorService pool =
            java.util.concurrent.Executors.newCachedThreadPool(r -> {
                Thread t = new Thread(r);
                t.setDaemon(true);
                return t;
            });

    MockApi() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(pool);
        server.createContext("/v1/search", exchange -> {
            int n = hits.getAndIncrement();
            try (InputStream in = exchange.getRequestBody()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int read;
                while ((read = in.read(chunk)) > 0) {
                    buf.write(chunk, 0, read);
                }
                synchronized (this) {
                    receivedBodies.add(buf.toString("UTF-8"));
                    receivedAuthHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
                    receivedUserAgents.add(exchange.getRequestHeaders().getFirst("User-Agent"));
                }
            }
            Scripted s;
            synchronized (this) {
                s = script.get(Math.min(n, script.size() - 1));
            }
            if (s.delayMillis > 0) {
                try {
                    Thread.sleep(s.delayMillis);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            for (Map.Entry<String, String> h : s.headers.entrySet()) {
                exchange.getResponseHeaders().add(h.getKey(), h.getValue());
            }
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            byte[] body = s.body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(s.status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    MockApi enqueue(int status, String body) {
        return enqueue(status, body, Map.of());
    }

    synchronized MockApi enqueue(int status, String body, Map<String, String> headers) {
        script.add(new Scripted(status, body, headers, 0));
        return this;
    }

    synchronized MockApi enqueueDelayed(int status, String body, long delayMillis) {
        script.add(new Scripted(status, body, Map.of(), delayMillis));
        return this;
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    int hits() {
        return hits.get();
    }

    @Override
    public void close() {
        server.stop(0);
        pool.shutdownNow();
    }
}
