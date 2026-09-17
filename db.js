const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'cafe.db'));
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const TIERS = [
  { name: 'Gold', min: 1500, rate: 1.5 },
  { name: 'Silver', min: 500, rate: 1.25 },
  { name: 'Bronze', min: 0, rate: 1 },
];

function getTier(earned) {
  for (const t of TIERS) {
    if (earned >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

function lifetimeEarned(id) {
  const r = db.prepare("SELECT COALESCE(SUM(points_delta),0) total FROM transactions WHERE member_id=? AND type='purchase'").get(id);
  return r.total;
}

function currentBalance(id) {
  const r = db.prepare('SELECT COALESCE(SUM(points_delta),0) total FROM transactions WHERE member_id=?').get(id);
  return r.total;
}

function memberWithStats(m) {
  const earned = lifetimeEarned(m.id);
  const tier = getTier(earned);
  return { ...m, lifetimeEarned: earned, balance: currentBalance(m.id), tier: tier.name };
}

function recordPurchase(id, amount) {
  const tier = getTier(lifetimeEarned(id));
  const pts = Math.floor(amount * tier.rate);
  db.prepare("INSERT INTO transactions (member_id, type, amount_spent, points_delta) VALUES (?, 'purchase', ?, ?)").run(id, amount, pts);
  return pts;
}

const redeemTxn = db.transaction((id, pts, item) => {
  const bal = currentBalance(id);
  if (pts <= 0) throw new Error('enter a valid points amount');
  if (pts > bal) throw new Error(`not enough points - has ${bal}, tried to redeem ${pts}`);
  db.prepare("INSERT INTO transactions (member_id, type, points_delta, item_redeemed) VALUES (?, 'redeem', ?, ?)").run(id, -pts, item);
  return bal - pts;
});

module.exports = { db, memberWithStats, recordPurchase, redeemTxn, currentBalance, lifetimeEarned, getTier };