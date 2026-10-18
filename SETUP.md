# PAUSE! Arcade Prototype

Includes HTML/CSS/JavaScript frontend, desire-tracking and stats charts, and a small Java development server for real demo email/password accounts.

## Install in your existing repo

- Copy the three files in `frontend/` into your repo's `frontend/`, replacing the older versions.
- Copy the `server/` directory into the repo root.
- Merge these `.gitignore` lines into your own `.gitignore` (do not commit `server/data/` or `.class` files).

## Start with email/password accounts (Java 17+)

Stop any running Python server on port 5500 with Ctrl+C.

Run from your repository root (BCShacks2026):

```sh
javac server/PauseServer.java
java -cp server PauseServer
```

Open http://localhost:5500. Click **LOG IN / SIGN UP** in the upper-right corner. Create a test account. The Java server saves credentials (salted PBKDF2 hashes, not plaintext passwords) and separate per-account dashboard state in `server/data/`.

To use **guest mode only**, you may still run `python3 -m http.server 5500` from the `frontend/` directory. The login/register buttons will show a server-unavailable message, since Python's basic static server does not provide an account API.

Guest data (existing localStorage items, ratings, budget) stays separate from signed-in data and returns when you log out. There is no automatic migration to an account.

**Hackathon/dev use only.** The Java server listens on `127.0.0.1`, which means friends on other devices cannot log in until the project is deployed to a real server. Before any public deployment, add HTTPS, a real database, rate limiting, account recovery, production session management, backup, and appropriate security review. Do not upload actual personal passwords to a publicly hosted instance of this prototype. Account sessions live in memory and end if the Java process restarts.

## Stats logic

- **Declined vs approved**: A declined quest records potential spending avoided; an approved quest can only be recorded once its cooldown expires. Approval is a decision log, not a payment.
- **Current desire**: Average of each active item's most recent recorded score.
- **Desire projection**: A simple, explicitly illustrative 7-day linear extrapolation of per-item changes between the two most recent dated check-ins. Only shown if at least one item has two dates. Dots represent real daily averages of logged ratings. It is **not** an AI prediction and does not invent check-ins.
- **Savings**: Value of purchases the user chose not to make, not money verified in a bank account.
