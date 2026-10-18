package com.impulsepreventerapp.backend;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Repository
public class ItemRepository {
    private final JdbcTemplate db;
    public ItemRepository(JdbcTemplate db) { this.db = db; }

    private Item map(ResultSet rs, int row) throws SQLException {
        Instant deadline = rs.getTimestamp("deadline").toInstant();
        long seconds = Math.max(0, deadline.getEpochSecond() - Instant.now().getEpochSecond());
        long days = (seconds + 86399) / 86400;
        return new Item(rs.getLong("id"), rs.getString("name"), rs.getBigDecimal("price"),
            rs.getString("reason"), rs.getString("product_url"), rs.getString("photo_url"),
            rs.getTimestamp("created_at").toInstant(), deadline, rs.getString("status"), days);
    }
    public List<Item> findAll(java.util.UUID userId) {
        return db.query("SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC, id DESC", this::map, userId);
    }
    public List<Item> findById(long id, java.util.UUID userId) {
        return db.query("SELECT * FROM items WHERE id = ? AND user_id = ?", this::map, id, userId);
    }
    public Item insert(java.util.UUID userId, String name, BigDecimal price, String reason, String productUrl,
                       String photoUrl, Instant deadline) {
        return db.queryForObject("""
            INSERT INTO items (user_id, name, price, reason, product_url, photo_url, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
            """, this::map, userId, name, price, reason, productUrl, photoUrl, Timestamp.from(deadline));
    }
    public Item setStatus(long id, java.util.UUID userId, String status) {
        return db.queryForObject("UPDATE items SET status = ? WHERE id = ? AND user_id = ? RETURNING *",
            this::map, status, id, userId);
    }
}
