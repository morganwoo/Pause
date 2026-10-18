package com.impulsepreventerapp.backend;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.UUID;
@RestController
public class BudgetController {
    private final JdbcTemplate db;
    private final UserAuth auth;
    public BudgetController(JdbcTemplate db, UserAuth auth) { this.db=db; this.auth=auth; }
    public record BudgetRequest(BigDecimal monthlyBudget) {}
    private BigDecimal budget(UUID uid) {
        return db.query("SELECT monthly_budget FROM user_budgets WHERE user_id = ?", rs -> rs.next() ? rs.getBigDecimal(1) : BigDecimal.valueOf(500), uid);
    }
    @GetMapping("/budget")
    public Map<String, BigDecimal> getBudget(@RequestHeader(value="Authorization", required=false) String token) {
        return Map.of("monthlyBudget", budget(auth.requireUser(token)));
    }
    @PutMapping("/budget")
    public Map<String, BigDecimal> setBudget(@RequestHeader(value="Authorization", required=false) String token, @RequestBody BudgetRequest request) {
        UUID uid=auth.requireUser(token);
        BigDecimal amount=request.monthlyBudget();
        if(amount==null || amount.signum()<=0 || amount.scale()>2)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid budget");
        db.update("INSERT INTO user_budgets (user_id, monthly_budget) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget", uid, amount);
        return Map.of("monthlyBudget",amount);
    }
    @GetMapping("/stats")
    public Map<String,Object> stats(@RequestHeader(value="Authorization", required=false) String token) {
        UUID uid=auth.requireUser(token);
        BigDecimal saved=db.queryForObject("SELECT COALESCE(SUM(price), 0) FROM items WHERE user_id = ? AND status = 'declined'",BigDecimal.class,uid);
        BigDecimal amount=budget(uid);
        BigDecimal percent=amount.signum()>0 ? saved.multiply(BigDecimal.valueOf(100)).divide(amount,1,RoundingMode.HALF_UP) : BigDecimal.ZERO;
        return Map.of("totalSaved",saved,"monthlyBudget",amount,"savedAsPercentOfBudget",percent);
    }
}
