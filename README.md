# cafe_chain_reward_programme
A café rewards management system that tracks members, purchases, reward points, membership tiers, and redemptions. Supports Silver and Gold tiers with faster earning rates, accurate live balances, and phone-number-based member lookup. Designed to handle any café, member, purchase, and reward efficiently.

# Café Rewards Programme

A full-stack café loyalty system built with **Node.js, Express, SQLite, and EJS**.

### Features

* Staff registration/login
* Member search by name/phone
* Purchase and point tracking
* Bronze → Silver → Gold → Platinum tiers
* Point redemption with accurate balance
* FIFO-based 90-day point expiration
* Simulated clock for testing expiration
* Tier-change notification events via transactional outbox
* REST APIs with pagination and sorting

---

## Tech Stack

**Node.js · Express · SQLite (better-sqlite3) · EJS · bcryptjs · express-session**

---

## Setup

### 1. Clone the project

```bash
git clone https://github.com/chahat212/cafe_chain_reward_programme.git
cd cafe_chain_reward_programme
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

The SQLite database `cafe.db` is created automatically from `schema.sql`.

---

## Debug / Reset

### Restart server

```text
Ctrl + C
node server.js
```

### Reset database

Stop the server and delete:

```text
cafe.db
```

Then run:

```bash
node server.js
```

A fresh database will be created.

### Check database

If SQLite CLI is installed:

```bash
sqlite3 cafe.db
```

```sql
.tables
SELECT * FROM members;
SELECT * FROM transactions;
SELECT * FROM point_lots;
SELECT * FROM outbox;
```

For API errors, check the **terminal**, browser **Console**, and **Network** tab.

---

# API Endpoints

> All `/api/*` endpoints require login.

| Method | Endpoint                        | Purpose                            |
| ------ | ------------------------------- | ---------------------------------- |
| `POST` | `/register`                     | Register staff user                |
| `POST` | `/login`                        | Login                              |
| `POST` | `/logout`                       | Logout                             |
| `GET`  | `/api/members`                  | List/search members                |
| `POST` | `/api/members`                  | Create member                      |
| `GET`  | `/api/members/:id`              | Get member details                 |
| `GET`  | `/api/members/:id/transactions` | Transaction history                |
| `POST` | `/api/members/:id/purchase`     | Record purchase & earn points      |
| `POST` | `/api/members/:id/redeem`       | Redeem points                      |
| `GET`  | `/clock`                        | Get simulated time                 |
| `POST` | `/clock`                        | Advance time & expire stale points |
| `GET`  | `/outbox`                       | View tier-change notifications     |

### Search / Pagination

```text
GET /api/members?search=rahul&page=1&limit=10&sort=name&order=asc
```

### Purchase

```json
{
  "amount": 500
}
```

### Redeem

```json
{
  "points": 100,
  "item": "Free Coffee"
}
```

### Advance Clock

```json
{
  "now": "2026-12-20T12:00:00.000Z"
}
```

---

## Loyalty Rules

```text
Bronze    → 0+ points     → 1 point/₹
Silver    → 500+          → 1.25 points/₹
Gold      → 1500+         → 1.5 points/₹
Platinum  → 5000+         → 0.3 points/₹
```

Points expire after **90 days if unused**. Lifetime earned points determine the tier, so redemption/expiration does not cause tier demotion.
