package com.impulsepreventerapp.backend;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/items")
public class ItemController {
    private final ItemService service;
    private final UserAuth auth;
    public ItemController(ItemService service, UserAuth auth) { this.service = service; this.auth = auth; }
    public record NewItem(String name, BigDecimal price, String reason,
                          String productUrl, String photoUrl, Integer waitingDays) {}
    public record Decision(String status) {}

    @GetMapping
    public List<Item> getItems(@RequestHeader(value="Authorization", required=false) String token) { return service.getItems(auth.requireUser(token)); }

    @PostMapping
    public ResponseEntity<Item> addItem(@RequestHeader(value="Authorization", required=false) String token, @RequestBody NewItem request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addItem(auth.requireUser(token), request));
    }

    @PatchMapping("/{id}")
    public Item decide(@RequestHeader(value="Authorization", required=false) String token, @PathVariable long id, @RequestBody Decision request) {
        return service.decide(auth.requireUser(token), id, request);
    }
}
