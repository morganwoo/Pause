package com.impulsepreventerapp.backend;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;
@RestController
public class AuthConfigController {
    @Value("${SUPABASE_URL:}") private String url;
    @Value("${SUPABASE_ANON_KEY:}") private String anonKey;
    @GetMapping("/auth-config")
    public Map<String,String> config() { return Map.of("url",url,"anonKey",anonKey); }
}
