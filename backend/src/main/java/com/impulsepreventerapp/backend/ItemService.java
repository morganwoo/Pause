package com.impulsepreventerapp.backend;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class ItemService {
    private final ItemRepository repository;
    public ItemService(ItemRepository repository) { this.repository = repository; }
    public List<Item> getItems() { return repository.findAll(); }

    public Item addItem(ItemController.NewItem request) {
        if (request == null || request.name() == null || request.name().isBlank() ||
            request.price() == null || request.price().signum() < 0 || request.price().scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide a name and a valid price");
        }
        int days = request.waitingDays() == null ? 14 : request.waitingDays();
        if (days < 14 || days > 365) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Waiting period must be 14 to 365 days");
        }
        return repository.insert(request.name().trim(), request.price(), request.reason(),
            request.productUrl(), request.photoUrl(), Instant.now().plus(days, ChronoUnit.DAYS));
    }

    public Item decide(long id, ItemController.Decision request) {
        if (request == null || request.status() == null ||
            !(request.status().equals("declined") || request.status().equals("purchased"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status must be declined or purchased");
        }
        List<Item> matches = repository.findById(id);
        if (matches.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
        Item item = matches.get(0);
        if (!item.status().equals("waiting")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Item already has a final decision");
        }
        if (request.status().equals("purchased") && Instant.now().isBefore(item.deadline())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Countdown has not ended");
        }
        return repository.setStatus(id, request.status());
    }
}
