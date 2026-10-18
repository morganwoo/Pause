package com.impulsepreventerapp.backend;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

@Component
public class UserAuth {
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();
    @Value("${SUPABASE_URL:}") private String url;
    @Value("${SUPABASE_ANON_KEY:}") private String anonKey;

    public UUID requireUser(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ") || authorization.length() > 8192)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in required");
        if (url.isBlank() || anonKey.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Supabase Auth is not configured");
        try {
            String token = authorization.substring(7);
            HttpRequest request = HttpRequest.newBuilder(URI.create(url.replaceAll("/+$", "") + "/auth/v1/user"))
                .timeout(Duration.ofSeconds(8)).header("apikey", anonKey)
                .header("Authorization", "Bearer " + token).GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired session");
            JsonNode user = mapper.readTree(response.body());
            if (!user.hasNonNull("id")) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user");
            return UUID.fromString(user.get("id").asText());
        } catch (ResponseStatusException ex) { throw ex; }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Auth validation unavailable"); }
    }
}
