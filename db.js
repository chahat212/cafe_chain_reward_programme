const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'cafe.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(
  fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  )
);

module.exports = { db };