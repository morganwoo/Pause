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
    public ItemController(ItemService service) { this.service = service; }
    public record NewItem(String name, BigDecimal price, String reason,
                          String productUrl, String photoUrl, Integer waitingDays) {}
    public record Decision(String status) {}

    @GetMapping
    public List<Item> getItems() { return service.getItems(); }

    @PostMapping
    public ResponseEntity<Item> addItem(@RequestBody NewItem request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addItem(request));
    }

    @PatchMapping("/{id}")
    public Item decide(@PathVariable long id, @RequestBody Decision request) {
        return service.decide(id, request);
    }
}
