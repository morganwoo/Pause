package com.impulsepreventerapp.backend;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

@RestController
public class BudgetController {
    private final JdbcTemplate db;

    public BudgetController(JdbcTemplate db) {
        this.db = db;
    }

    public record BudgetRequest(BigDecimal monthlyBudget) {}

    @GetMapping("/budget")
    public Map<String, BigDecimal> getBudget() {
        BigDecimal amount = db.queryForObject("SELECT monthly_budget FROM app_budget WHERE id = 1", BigDecimal.class);
        return Map.of("monthlyBudget", amount);
    }

    @PutMapping("/budget")
    public Map<String, BigDecimal> setBudget(@RequestBody BudgetRequest request) {
        BigDecimal amount = request.monthlyBudget();
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Monthly budget must be positive with up to two decimals");
        }
        db.update("UPDATE app_budget SET monthly_budget = ? WHERE id = 1", amount);
        return getBudget();
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        BigDecimal saved = db.queryForObject("SELECT COALESCE(SUM(price), 0) FROM items WHERE status = 'declined'", BigDecimal.class);
        BigDecimal budget = db.queryForObject("SELECT monthly_budget FROM app_budget WHERE id = 1", BigDecimal.class);
        BigDecimal percent = budget.signum() > 0
                ? saved.multiply(BigDecimal.valueOf(100)).divide(budget, 1, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        return Map.of("totalSaved", saved, "monthlyBudget", budget,
                "savedAsPercentOfBudget", percent);
    }
}
