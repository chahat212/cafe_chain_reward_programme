const { db } = require('../db');


// ============================================
// TIER CONFIGURATION
// ============================================

const TIERS = [
  {
    name: 'Platinum',
    min: 5000,
    rate: 0.3
  },
  {
    name: 'Gold',
    min: 1500,
    rate: 1.5
  },
  {
    name: 'Silver',
    min: 500,
    rate: 1.25
  },
  {
    name: 'Bronze',
    min: 0,
    rate: 1
  }
];


// ============================================
// SIMULATED CLOCK
// ============================================

function getNow() {
  const row = db.prepare(`
    SELECT current_time
    FROM clock
    WHERE id = 1
  `).get();

  return row.current_time;
}


function setNow(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid clock time');
  }

  const iso = date.toISOString();

  db.prepare(`
    UPDATE clock
    SET current_time = ?
    WHERE id = 1
  `).run(iso);

  return iso;
}


// ============================================
// TIER
// ============================================

function getTier(lifetimePoints) {
  for (const tier of TIERS) {
    if (lifetimePoints >= tier.min) {
      return tier;
    }
  }

  return TIERS[TIERS.length - 1];
}


// ============================================
// LIFETIME EARNED
// ============================================

function lifetimeEarned(memberId) {
  const result = db.prepare(`
    SELECT COALESCE(
      SUM(points_delta),
      0
    ) AS total

    FROM transactions

    WHERE member_id = ?
      AND type = 'purchase'
  `).get(memberId);

  return result.total;
}


// ============================================
// CURRENT BALANCE
// ============================================

function currentBalance(memberId) {
  const result = db.prepare(`
    SELECT COALESCE(
      SUM(points_delta),
      0
    ) AS total

    FROM transactions

    WHERE member_id = ?
  `).get(memberId);

  return result.total;
}


// ============================================
// MEMBER + COMPUTED STATS
// ============================================

function memberWithStats(member) {
  const earned = lifetimeEarned(member.id);
  const tier = getTier(earned);
  const balance = currentBalance(member.id);

  return {
    ...member,
    lifetimeEarned: earned,
    balance,
    tier: tier.name
  };
}


// ============================================
// PURCHASE
// ============================================

const purchaseTxn = db.transaction((memberId, amount) => {

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid purchase amount');
  }

  const member = db.prepare(`
    SELECT *
    FROM members
    WHERE id = ?
  `).get(memberId);

  if (!member) {
    throw new Error('Member not found');
  }

  const oldLifetime = lifetimeEarned(memberId);
  const oldTier = getTier(oldLifetime);

  const points = Math.floor(
    amount * oldTier.rate
  );

  if (points <= 0) {
    throw new Error(
      'Purchase must earn at least 1 point'
    );
  }

  const now = getNow();

  // ------------------------------------------
  // 1. Create purchase ledger transaction
  // ------------------------------------------

  const transaction = db.prepare(`
    INSERT INTO transactions (
      member_id,
      type,
      amount_spent,
      points_delta,
      created_at
    )
    VALUES (?, 'purchase', ?, ?, ?)
  `).run(
    memberId,
    amount,
    points,
    now
  );

  const transactionId =
    Number(transaction.lastInsertRowid);


  // ------------------------------------------
  // 2. Create point lot
  // ------------------------------------------

  db.prepare(`
    INSERT INTO point_lots (
      member_id,
      purchase_transaction_id,
      points,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).run(
    memberId,
    transactionId,
    points,
    now
  );


  // ------------------------------------------
  // 3. Calculate new tier
  // ------------------------------------------

  const newLifetime =
    oldLifetime + points;

  const newTier =
    getTier(newLifetime);


  // ------------------------------------------
  // 4. T1 - Tier upgrade notification
  // ------------------------------------------

  if (oldTier.name !== newTier.name) {

    db.prepare(`
      INSERT INTO outbox (
        event_type,
        member_id,
        payload,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `).run(
      'tier_upgraded',
      memberId,
      JSON.stringify({
        from: oldTier.name,
        to: newTier.name,
        lifetimeEarned: newLifetime
      }),
      now
    );
  }


  return {
    pointsEarned: points,
    lifetimeEarned: newLifetime,
    tier: newTier.name,
    transactionId
  };

}).immediate;


// ============================================
// REDEMPTION
// ============================================

const redeemTxn = db.transaction(
  (memberId, points, item) => {

    if (!Number.isInteger(points) || points <= 0) {
      throw new Error(
        'Enter a valid points amount'
      );
    }

    if (!item || !item.trim()) {
      throw new Error(
        'Enter the item to redeem'
      );
    }

    const member = db.prepare(`
      SELECT id
      FROM members
      WHERE id = ?
    `).get(memberId);

    if (!member) {
      throw new Error('Member not found');
    }


    // ----------------------------------------
    // Expire stale points first
    // ----------------------------------------

    expireMemberLotsInternal(memberId);


    // ----------------------------------------
    // Check latest balance
    // ----------------------------------------

    const balance =
      currentBalance(memberId);

    if (points > balance) {
      throw new Error(
        `Not enough points - has ${balance}, tried to redeem ${points}`
      );
    }


    const now = getNow();


    // ----------------------------------------
    // Create redemption transaction
    // ----------------------------------------

    const transaction = db.prepare(`
      INSERT INTO transactions (
        member_id,
        type,
        points_delta,
        item_redeemed,
        created_at
      )
      VALUES (?, 'redeem', ?, ?, ?)
    `).run(
      memberId,
      -points,
      item.trim(),
      now
    );

    const transactionId =
      Number(transaction.lastInsertRowid);


    // ----------------------------------------
    // FIFO LOT CONSUMPTION
    // ----------------------------------------

    const lots = db.prepare(`
      SELECT
        pl.id,
        pl.points,

        pl.points -
        COALESCE(
          SUM(la.points_used),
          0
        ) AS remaining

      FROM point_lots pl

      LEFT JOIN lot_allocations la
        ON la.lot_id = pl.id

      WHERE pl.member_id = ?

      GROUP BY pl.id

      HAVING remaining > 0

      ORDER BY
        pl.created_at ASC,
        pl.id ASC
    `).all(memberId);


    let remainingToConsume = points;


    for (const lot of lots) {

      if (remainingToConsume <= 0) {
        break;
      }

      const available =
        Number(lot.remaining);

      const consume =
        Math.min(
          available,
          remainingToConsume
        );


      db.prepare(`
        INSERT INTO lot_allocations (
          lot_id,
          transaction_id,
          points_used,
          reason,
          created_at
        )
        VALUES (?, ?, ?, 'redeem', ?)
      `).run(
        lot.id,
        transactionId,
        consume,
        now
      );

      remainingToConsume -= consume;
    }


    if (remainingToConsume !== 0) {
      throw new Error(
        'Could not allocate redemption points'
      );
    }


    return {
      balance: balance - points,
      transactionId
    };

  }
).immediate;


// ============================================
// INTERNAL EXPIRATION
// ============================================

function expireMemberLotsInternal(memberId) {

  const now = new Date(getNow());

  const expirationCutoff =
    new Date(
      now.getTime() -
      90 * 24 * 60 * 60 * 1000
    );


  const lots = db.prepare(`
    SELECT
      pl.id,
      pl.points,
      pl.created_at,

      pl.points -
      COALESCE(
        SUM(la.points_used),
        0
      ) AS remaining

    FROM point_lots pl

    LEFT JOIN lot_allocations la
      ON la.lot_id = pl.id

    WHERE pl.member_id = ?

    GROUP BY pl.id

    HAVING remaining > 0

    ORDER BY
      pl.created_at ASC,
      pl.id ASC
  `).all(memberId);


  for (const lot of lots) {

    const lotDate =
      new Date(lot.created_at);


    // Not old enough
    if (lotDate > expirationCutoff) {
      continue;
    }


    const remaining =
      Number(lot.remaining);

    if (remaining <= 0) {
      continue;
    }


    // ----------------------------------------
    // Create expiration transaction
    // ----------------------------------------

    const transaction = db.prepare(`
      INSERT INTO transactions (
        member_id,
        type,
        points_delta,
        created_at
      )
      VALUES (?, 'expiration', ?, ?)
    `).run(
      memberId,
      -remaining,
      getNow()
    );


    const transactionId =
      Number(transaction.lastInsertRowid);


    // ----------------------------------------
    // Mark remaining lot points as expired
    // ----------------------------------------

    db.prepare(`
      INSERT INTO lot_allocations (
        lot_id,
        transaction_id,
        points_used,
        reason,
        created_at
      )
      VALUES (?, ?, ?, 'expiration', ?)
    `).run(
      lot.id,
      transactionId,
      remaining,
      getNow()
    );
  }
}


// ============================================
// PUBLIC EXPIRATION SWEEP
// ============================================

const expireAllStalePoints = db.transaction(() => {

  const members = db.prepare(`
    SELECT id
    FROM members
  `).all();

  let expiredPoints = 0;

  for (const member of members) {

    const before =
      currentBalance(member.id);

    expireMemberLotsInternal(member.id);

    const after =
      currentBalance(member.id);

    expiredPoints +=
      Math.max(before - after, 0);
  }

  return expiredPoints;

}).immediate;


// ============================================
// EXPORTS
// ============================================

module.exports = {
  getNow,
  setNow,
  getTier,
  lifetimeEarned,
  currentBalance,
  memberWithStats,
  purchaseTxn,
  redeemTxn,
  expireAllStalePoints
};