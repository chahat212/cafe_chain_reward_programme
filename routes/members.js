const express = require('express');

const { db } = require('../db');

const {
  memberWithStats,
  recordPurchase,
  redeemTxn,
  currentBalance
} = require('../services/loyalty');

const { requireLogin } = require('../middleware/auth');

const router = express.Router();


// ============================================
// DASHBOARD
// ============================================

router.get('/dashboard', requireLogin, (req, res) => {
  const search = req.query.search || '';

  const page = Math.max(
    parseInt(req.query.page) || 1,
    1
  );

  const limit = 10;

  const sort =
    req.query.sort === 'created_at'
      ? 'created_at'
      : 'name';

  const order =
    req.query.order === 'desc'
      ? 'DESC'
      : 'ASC';

  const rows = db.prepare(`
    SELECT *
    FROM members
    WHERE phone LIKE ?
       OR name LIKE ?
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `).all(
    `%${search}%`,
    `%${search}%`,
    limit,
    (page - 1) * limit
  );

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM members
    WHERE phone LIKE ?
       OR name LIKE ?
  `).get(
    `%${search}%`,
    `%${search}%`
  ).count;

  res.render('dashboard', {
    members: rows.map(memberWithStats),
    search,
    page,
    sort,
    order,
    totalPages: Math.max(
      Math.ceil(total / limit),
      1
    ),
    username: req.session.username
  });
});


// ============================================
// CREATE MEMBER - UI
// ============================================

router.post('/members', requireLogin, (req, res) => {
  try {
    const name = req.body.name?.trim();
    const phone = req.body.phone?.trim();

    if (!name || !phone) {
      return res.status(400).send('Name and phone are required');
    }

    db.prepare(`
      INSERT INTO members (name, phone)
      VALUES (?, ?)
    `).run(name, phone);

    res.redirect('/dashboard');

  } catch (error) {
    res.status(400).send('Member already exists or invalid data');
  }
});


// ============================================
// MEMBER DETAILS
// ============================================

router.get('/members/:id', requireLogin, (req, res) => {
  const member = db.prepare(`
    SELECT *
    FROM members
    WHERE id = ?
  `).get(req.params.id);

  if (!member) {
    return res.status(404).send('No such member');
  }

  const history = db.prepare(`
    SELECT *
    FROM transactions
    WHERE member_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(member.id);

  res.render('member', {
    member: memberWithStats(member),
    history,
    error: req.query.error || null,
    username: req.session.username
  });
});


// ============================================
// PURCHASE - UI
// ============================================

router.post('/members/:id/purchase', requireLogin, (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);

    recordPurchase(
      Number(req.params.id),
      amount
    );

    res.redirect(`/members/${req.params.id}`);

  } catch (error) {
    res.redirect(
      `/members/${req.params.id}?error=${encodeURIComponent(error.message)}`
    );
  }
});


// ============================================
// REDEEM - UI
// ============================================

router.post('/members/:id/redeem', requireLogin, (req, res) => {
  try {
    const points = parseInt(req.body.points);
    const item = req.body.item;

    redeemTxn(
      Number(req.params.id),
      points,
      item
    );

    res.redirect(`/members/${req.params.id}`);

  } catch (error) {
    res.redirect(
      `/members/${req.params.id}?error=${encodeURIComponent(error.message)}`
    );
  }
});


// ============================================
// REST API - LIST MEMBERS
// ============================================

router.get('/api/members', requireLogin, (req, res) => {
  const search = req.query.search || '';

  const page = Math.max(
    parseInt(req.query.page) || 1,
    1
  );

  const requestedLimit =
    parseInt(req.query.limit) || 10;

  const limit = Math.min(
    Math.max(requestedLimit, 1),
    100
  );

  const sort =
    req.query.sort === 'created_at'
      ? 'created_at'
      : 'name';

  const order =
    req.query.order === 'desc'
      ? 'DESC'
      : 'ASC';

  const rows = db.prepare(`
    SELECT *
    FROM members
    WHERE phone LIKE ?
       OR name LIKE ?
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `).all(
    `%${search}%`,
    `%${search}%`,
    limit,
    (page - 1) * limit
  );

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM members
    WHERE phone LIKE ?
       OR name LIKE ?
  `).get(
    `%${search}%`,
    `%${search}%`
  ).count;

  res.json({
    members: rows.map(memberWithStats),
    page,
    limit,
    total,
    totalPages: Math.max(
      Math.ceil(total / limit),
      1
    )
  });
});


// ============================================
// REST API - SINGLE MEMBER
// ============================================

router.get('/api/members/:id', requireLogin, (req, res) => {
  const member = db.prepare(`
    SELECT *
    FROM members
    WHERE id = ?
  `).get(req.params.id);

  if (!member) {
    return res.status(404).json({
      error: 'Member not found'
    });
  }

  res.json(memberWithStats(member));
});


// ============================================
// REST API - TRANSACTIONS
// ============================================

router.get(
  '/api/members/:id/transactions',
  requireLogin,
  (req, res) => {

    const transactions = db.prepare(`
      SELECT *
      FROM transactions
      WHERE member_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(req.params.id);

    res.json(transactions);
  }
);


// ============================================
// REST API - CREATE MEMBER
// ============================================

router.post(
  '/api/members',
  requireLogin,
  express.json(),
  (req, res) => {

    try {
      const name = req.body.name?.trim();
      const phone = req.body.phone?.trim();

      if (!name || !phone) {
        return res.status(400).json({
          error: 'Name and phone are required'
        });
      }

      const info = db.prepare(`
        INSERT INTO members (name, phone)
        VALUES (?, ?)
      `).run(name, phone);

      res.status(201).json({
        id: Number(info.lastInsertRowid),
        name,
        phone
      });

    } catch (error) {
      res.status(400).json({
        error: 'Phone number already exists or invalid data'
      });
    }
  }
);


// ============================================
// REST API - PURCHASE
// ============================================

router.post(
  '/api/members/:id/purchase',
  requireLogin,
  express.json(),
  (req, res) => {

    try {
      const amount = parseFloat(req.body.amount);

      const points = recordPurchase(
        Number(req.params.id),
        amount
      );

      res.json({
        pointsEarned: points,
        balance: currentBalance(
          Number(req.params.id)
        )
      });

    } catch (error) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);


// ============================================
// REST API - REDEMPTION
// ============================================

router.post(
  '/api/members/:id/redeem',
  requireLogin,
  express.json(),
  (req, res) => {

    try {
      const points = parseInt(req.body.points);
      const item = req.body.item;

      const balance = redeemTxn(
        Number(req.params.id),
        points,
        item
      );

      res.json({
        success: true,
        balance
      });

    } catch (error) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);


module.exports = router;