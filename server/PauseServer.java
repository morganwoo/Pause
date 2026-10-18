import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * PAUSE! Hackathon Java development server, dependency-free (Java 17+).
 * Local-only sample account implementation. Not production hosting infrastructure.
 * Stores PBKDF2-hashed password records and per-account JSON dashboard snapshots.
 * Run from the repository root: javac server/PauseServer.java && java -cp server PauseServer
 */
public final class PauseServer {
    private static final int PORT = 5500;
    private static final int MAX_BODY = 512_000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Path FRONTEND = Path.of("frontend").toAbsolutePath().normalize();
    private static final Path DATA = Path.of("server", "data").toAbsolutePath().normalize();
    private static final Path USERS_FILE = DATA.resolve("accounts.properties");
    private static final Properties USERS = new Properties();
    private static final ConcurrentHashMap<String, Session> SESSIONS = new ConcurrentHashMap<>();
    private record Session(String id, long expiresAt) {}

    public static void main(String[] args) throws Exception {
        if (!Files.isRegularFile(FRONTEND.resolve("index.html"))) {
            System.err.println("Run this from the repository root, where frontend/index.html exists.");
            System.exit(1);
        }
        Files.createDirectories(DATA);
        if (Files.isRegularFile(USERS_FILE)) {
            try (InputStream in = Files.newInputStream(USERS_FILE)) { USERS.load(in); }
        }
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", PORT), 0);
        server.createContext("/", PauseServer::route);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.println("PAUSE! Java server ready at http://localhost:" + PORT);
        System.out.println("Accounts and progress saved under server/data (do not commit). Press Ctrl+C to stop.");
    }

    private static void route(HttpExchange ex) throws IOException {
        try {
            ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            ex.getResponseHeaders().set("Referrer-Policy", "strict-origin-when-cross-origin");
            ex.getResponseHeaders().set("Cache-Control", "no-store");
            String path = ex.getRequestURI().getPath();
            if (path.startsWith("/api/")) {
                if (!ex.getRequestMethod().equals("GET") && !safeWriteRequest(ex)) { reply(ex, 403, jsonError("Request blocked")); return; }
                switch (path) {
                    case "/api/auth/register" -> credentials(ex, true);
                    case "/api/auth/login" -> credentials(ex, false);
                    case "/api/auth/logout" -> logout(ex);
                    case "/api/auth/me" -> me(ex);
                    case "/api/state" -> state(ex);
                    default -> reply(ex, 404, jsonError("Unknown API route"));
                }
            } else { staticFile(ex, path); }
        } catch (Exception error) {
            error.printStackTrace();
            try { reply(ex, 500, jsonError("Server error")); } catch (Exception ignored) {}
        } finally { ex.close(); }
    }

    // Require a custom same-origin header for writes; browsers cannot send it
    // cross-origin without a successful CORS preflight (this server enables no CORS).
    private static boolean safeWriteRequest(HttpExchange ex) {
        String custom = ex.getRequestHeaders().getFirst("X-Pause-Client");
        String origin = ex.getRequestHeaders().getFirst("Origin");
        return "1".equals(custom) && (origin == null || origin.equals("http://localhost:5500") || origin.equals("http://127.0.0.1:5500"));
    }

    private static void credentials(HttpExchange ex, boolean register) throws Exception {
        if (!"POST".equals(ex.getRequestMethod())) { methodError(ex); return; }
        String type = ex.getRequestHeaders().getFirst("Content-Type");
        if (type == null || !type.startsWith("application/x-www-form-urlencoded")) { reply(ex, 415, jsonError("Expected a form")); return; }
        String body = body(ex, 4096);
        Map<String, String> form = parseForm(body);
        String email = form.getOrDefault("email", "").trim().toLowerCase(Locale.ROOT);
        String password = form.getOrDefault("password", "");
        if (!email.matches("^[^@\\s]{1,64}@[^@\\s]{1,190}$") || password.length() < 8 || password.length() > 128) {
            reply(ex, 400, jsonError("Enter a valid email and a password of 8–128 characters")); return;
        }
        String id;
        if (register) {
            synchronized (USERS) {
                if (findUser(email) != null) { reply(ex, 409, jsonError("Email already registered")); return; }
                id = UUID.randomUUID().toString();
                byte[] salt = randomBytes(16);
                USERS.setProperty(id + ".email", email);
                USERS.setProperty(id + ".salt", Base64.getEncoder().encodeToString(salt));
                USERS.setProperty(id + ".hash", Base64.getEncoder().encodeToString(hash(password, salt)));
                saveUsers();
            }
        } else {
            synchronized (USERS) {
                id = findUser(email);
                if (id == null) { reply(ex, 401, jsonError("Invalid email or password")); return; }
                byte[] salt = Base64.getDecoder().decode(USERS.getProperty(id + ".salt"));
                byte[] expected = Base64.getDecoder().decode(USERS.getProperty(id + ".hash"));
                if (!MessageDigest.isEqual(hash(password, salt), expected)) {
                    reply(ex, 401, jsonError("Invalid email or password")); return;
                }
            }
        }
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(32));
        SESSIONS.put(token, new Session(id, Instant.now().getEpochSecond() + 86400));
        ex.getResponseHeaders().add("Set-Cookie", "pause_session=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400");
        reply(ex, 200, "{\"email\":\"" + escape(email) + "\"}");
    }

    private static String findUser(String email) {
        for (String key : USERS.stringPropertyNames()) {
            if (key.endsWith(".email") && USERS.getProperty(key).equals(email)) return key.substring(0, key.length() - 6);
        }
        return null;
    }
    private static void saveUsers() throws IOException {
        Path tmp = Files.createTempFile(DATA, "users-", ".tmp");
        try (OutputStream out = Files.newOutputStream(tmp)) { USERS.store(out, "PAUSE! local prototype auth"); }
        Files.move(tmp, USERS_FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
    private static byte[] hash(String password, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 210_000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    private static byte[] randomBytes(int length) { byte[] bytes = new byte[length]; RANDOM.nextBytes(bytes); return bytes; }

    private static void logout(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { methodError(ex); return; }
        String token = cookie(ex);
        if (token != null) SESSIONS.remove(token);
        ex.getResponseHeaders().add("Set-Cookie", "pause_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
        reply(ex, 200, "{\"ok\":true}");
    }
    private static void me(HttpExchange ex) throws IOException {
        if (!"GET".equals(ex.getRequestMethod())) { methodError(ex); return; }
        String user = currentUser(ex);
        if (user == null) { reply(ex, 401, jsonError("Please log in")); return; }
        reply(ex, 200, "{\"email\":\"" + escape(USERS.getProperty(user + ".email", "")) + "\"}");
    }
    private static void state(HttpExchange ex) throws IOException {
        String user = currentUser(ex);
        if (user == null) { reply(ex, 401, jsonError("Please log in")); return; }
        Path file = DATA.resolve(user + ".json");
        if ("GET".equals(ex.getRequestMethod())) {
            reply(ex, 200, Files.isRegularFile(file) ? Files.readString(file) : "{}");
        } else if ("PUT".equals(ex.getRequestMethod())) {
            String json;
            try { json = body(ex, MAX_BODY).trim(); }
            catch (IOException e) { reply(ex, 413, jsonError("Data too large")); return; }
            if (!json.startsWith("{") || !json.endsWith("}")) { reply(ex, 400, jsonError("Expected dashboard JSON")); return; }
            Path tmp = Files.createTempFile(DATA, "state-", ".tmp");
            Files.writeString(tmp, json, StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            reply(ex, 200, "{\"ok\":true}");
        } else methodError(ex);
    }
    private static String currentUser(HttpExchange ex) {
        String token = cookie(ex);
        if (token == null) return null;
        Session session = SESSIONS.get(token);
        if (session == null) return null;
        if (session.expiresAt < Instant.now().getEpochSecond()) { SESSIONS.remove(token); return null; }
        return session.id;
    }
    private static String cookie(HttpExchange ex) {
        String header = ex.getRequestHeaders().getFirst("Cookie");
        if (header == null) return null;
        for (String segment : header.split(";")) {
            String[] pair = segment.trim().split("=", 2);
            if (pair.length == 2 && pair[0].equals("pause_session")) return pair[1];
        }
        return null;
    }
    private static void staticFile(HttpExchange ex, String urlPath) throws IOException {
        if (!"GET".equals(ex.getRequestMethod())) { methodError(ex); return; }
        String decoded = URLDecoder.decode(urlPath, StandardCharsets.UTF_8);
        Path file = FRONTEND.resolve(decoded.equals("/") ? "index.html" : decoded.substring(1)).normalize();
        if (!file.startsWith(FRONTEND) || !Files.isRegularFile(file)) { reply(ex, 404, jsonError("Not found")); return; }
        String type = file.toString().endsWith(".html") ? "text/html; charset=utf-8"
            : file.toString().endsWith(".css") ? "text/css; charset=utf-8"
            : file.toString().endsWith(".js") ? "application/javascript; charset=utf-8"
            : "application/octet-stream";
        byte[] bytes = Files.readAllBytes(file);
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }
    private static String body(HttpExchange ex, int limit) throws IOException {
        byte[] bytes = ex.getRequestBody().readNBytes(limit + 1);
        if (bytes.length > limit) throw new IOException("Body limit exceeded");
        return new String(bytes, StandardCharsets.UTF_8);
    }
    private static Map<String, String> parseForm(String data) {
        Map<String, String> map = new HashMap<>();
        for (String field : data.split("&")) {
            String[] pair = field.split("=", 2);
            if (pair.length == 2) map.put(URLDecoder.decode(pair[0], StandardCharsets.UTF_8), URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
        }
        return map;
    }
    private static void reply(HttpExchange ex, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }
    private static void methodError(HttpExchange ex) throws IOException { reply(ex, 405, jsonError("Method not allowed")); }
    private static String jsonError(String text) { return "{\"error\":\"" + escape(text) + "\"}"; }
    private static String escape(String text) { return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n"); }
}
