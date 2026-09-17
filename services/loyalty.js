const { db } = require('../db');

const TIERS = [
  { name: 'Gold', min: 1500, rate: 1.5 },
  { name: 'Silver', min: 500, rate: 1.25 },
  { name: 'Bronze', min: 0, rate: 1 },
];

function getTier(earned) {
  for (const tier of TIERS) {
    if (earned >= tier.min) {
      return tier;
    }
  }

  return TIERS[TIERS.length - 1];
}

function lifetimeEarned(memberId) {
  const result = db.prepare(`
    SELECT COALESCE(SUM(points_delta), 0) AS total
    FROM transactions
    WHERE member_id = ?
      AND type = 'purchase'
  `).get(memberId);

  return result.total;
}

function currentBalance(memberId) {
  const result = db.prepare(`
    SELECT COALESCE(SUM(points_delta), 0) AS total
    FROM transactions
    WHERE member_id = ?
  `).get(memberId);

  return result.total;
}

function memberWithStats(member) {
  const earned = lifetimeEarned(member.id);
  const tier = getTier(earned);
  const balance = currentBalance(member.id);

  return {
    ...member,
    lifetimeEarned: earned,
    balance,
    tier: tier.name,
  };
}

function recordPurchase(memberId, amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid purchase amount');
  }

  const earned = lifetimeEarned(memberId);
  const tier = getTier(earned);

  const points = Math.floor(amount * tier.rate);

  if (points <= 0) {
    throw new Error('Purchase must earn at least 1 point');
  }

  db.prepare(`
    INSERT INTO transactions
      (member_id, type, amount_spent, points_delta)
    VALUES
      (?, 'purchase', ?, ?)
  `).run(memberId, amount, points);

  return points;
}


/*
 * IMPORTANT:
 * .immediate() makes SQLite acquire the write lock
 * before doing the balance check.
 *
 * This is important for concurrent redemptions.
 */
const redeemTxn = db.transaction((memberId, points, item) => {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error('Enter a valid points amount');
  }

  if (!item || !item.trim()) {
    throw new Error('Enter the item to redeem');
  }

  const balance = currentBalance(memberId);

  if (points > balance) {
    throw new Error(
      `Not enough points - member has ${balance}, tried to redeem ${points}`
    );
  }

  db.prepare(`
    INSERT INTO transactions
      (member_id, type, points_delta, item_redeemed)
    VALUES
      (?, 'redeem', ?, ?)
  `).run(memberId, -points, item.trim());

  return balance - points;
}).immediate;


module.exports = {
  getTier,
  lifetimeEarned,
  currentBalance,
  memberWithStats,
  recordPurchase,
  redeemTxn,
};