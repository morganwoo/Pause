
const form = document.getElementById("item-form");
const container = document.getElementById("items-container");

// Load previously saved items
let items = JSON.parse(localStorage.getItem("pauseItems") || "[]");

// Display items on the dashboard
function displayItems() {
    container.innerHTML = "";

    if (items.length === 0) {
        container.textContent = "No items yet. Add something!";
        return;
    }

    items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "item-card";

        // Calculate days remaining
        const deadline = item.createdAt + 14 * 24 * 60 * 60 * 1000;
        const daysLeft = Math.max(
            0,
            Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000))
        );

        const title = document.createElement("h3");
        title.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = `Price: $${item.price.toFixed(2)}`;

        const reason = document.createElement("p");
        reason.textContent = `Why: ${item.reason}`;

        const countdown = document.createElement("p");
        countdown.textContent = `${daysLeft} days remaining`;

        card.append(title, price, reason, countdown);
        container.appendChild(card);
    });
}

// Handle pre-order button
form.addEventListener("submit", function(event) {
    event.preventDefault();

    const item = {
        name: document.getElementById("item-name").value.trim(),
        price: Number(document.getElementById("item-price").value),
        reason: document.getElementById("item-reason").value.trim(),
        link: document.getElementById("item-link").value.trim(),
        createdAt: Date.now()
    };

    items.push(item);

    // Save items in the browser
    localStorage.setItem("pauseItems", JSON.stringify(items));

    displayItems();
    form.reset();
});

// Display saved items when the page loads
displayItems();
