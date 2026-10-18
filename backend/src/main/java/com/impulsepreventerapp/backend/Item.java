package com.impulsepreventerapp.backend;

import java.math.BigDecimal;
import java.time.Instant;

public record Item(long id, String name, BigDecimal price, String reason,
                       String productUrl, String photoUrl, Instant createdAt,
                       Instant deadline, String status, long daysRemaining) {}
