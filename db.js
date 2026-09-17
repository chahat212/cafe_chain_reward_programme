const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(
  path.join(__dirname, 'cafe.db')
);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(
  fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  )
);

// Initialize simulated clock once.
const existingClock = db.prepare(
  'SELECT id FROM clock WHERE id = 1'
).get();

if (!existingClock) {
  db.prepare(`
    INSERT INTO clock (id, current_time)
    VALUES (1, ?)
  `).run(new Date().toISOString());
}

module.exports = { db };