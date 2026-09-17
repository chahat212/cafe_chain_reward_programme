PRAGMA foreign_keys = ON;

-- ============================================
-- STAFF USERS
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ============================================
-- MEMBERS
-- ============================================

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ============================================
-- IMMUTABLE POINTS LEDGER
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    member_id INTEGER NOT NULL,

    type TEXT NOT NULL
        CHECK (type IN ('purchase', 'redeem', 'expiration')),

    amount_spent REAL,

    points_delta INTEGER NOT NULL
        CHECK (points_delta != 0),

    item_redeemed TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE RESTRICT,

    CHECK (
        (
            type = 'purchase'
            AND points_delta > 0
            AND item_redeemed IS NULL
        )
        OR
        (
            type = 'redeem'
            AND points_delta < 0
            AND item_redeemed IS NOT NULL
        )
        OR
        (
            type = 'expiration'
            AND points_delta < 0
            AND item_redeemed IS NULL
        )
    )
);


-- ============================================
-- POINT LOTS
--
-- Every purchase creates one immutable lot.
-- ============================================

CREATE TABLE IF NOT EXISTS point_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    member_id INTEGER NOT NULL,

    purchase_transaction_id INTEGER NOT NULL UNIQUE,

    points INTEGER NOT NULL
        CHECK (points > 0),

    created_at TEXT NOT NULL,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (purchase_transaction_id)
        REFERENCES transactions(id)
        ON DELETE RESTRICT
);


-- ============================================
-- LOT ALLOCATIONS
--
-- Records which points from a lot were consumed.
-- Nothing in point_lots is ever modified.
-- ============================================

CREATE TABLE IF NOT EXISTS lot_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lot_id INTEGER NOT NULL,

    transaction_id INTEGER NOT NULL,

    points_used INTEGER NOT NULL
        CHECK (points_used > 0),

    reason TEXT NOT NULL
        CHECK (reason IN ('redeem', 'expiration')),

    created_at TEXT NOT NULL,

    FOREIGN KEY (lot_id)
        REFERENCES point_lots(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (transaction_id)
        REFERENCES transactions(id)
        ON DELETE RESTRICT
);


-- ============================================
-- TRANSACTIONAL OUTBOX
-- ============================================

CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_type TEXT NOT NULL,

    member_id INTEGER NOT NULL,

    payload TEXT NOT NULL,

    created_at TEXT NOT NULL,

    processed_at TEXT,

    FOREIGN KEY (member_id)
        REFERENCES members(id)
        ON DELETE RESTRICT
);


-- ============================================
-- SIMULATED CLOCK
-- ============================================

CREATE TABLE IF NOT EXISTS clock (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    current_time TEXT NOT NULL
);


-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_members_phone
    ON members(phone);

CREATE INDEX IF NOT EXISTS idx_members_name
    ON members(name);

CREATE INDEX IF NOT EXISTS idx_transactions_member
    ON transactions(member_id);

CREATE INDEX IF NOT EXISTS idx_transactions_member_created
    ON transactions(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_lots_member_created
    ON point_lots(member_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_lot_allocations_lot
    ON lot_allocations(lot_id);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
    ON outbox(processed_at, created_at);