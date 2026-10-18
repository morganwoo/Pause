package com.impulsepreventerapp.backend;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class DatabaseTestController {
    private final JdbcTemplate db;

    public DatabaseTestController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping("/db-test")
    public Map<String, Object> test() {
        Integer result = db.queryForObject("SELECT 1", Integer.class);
        return Map.of("databaseConnected", result != null && result == 1);
    }
}
