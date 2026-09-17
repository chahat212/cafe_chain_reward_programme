const express = require('express');
const { db, memberWithStats, recordPurchase, redeemTxn, currentBalance } = require('../db');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

router.get('/dashboard', requireLogin, (req, res) => {
  const search = req.query.search || '';
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = 10;
  const sort = req.query.sort === 'created_at' ? 'created_at' : 'name';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(`SELECT * FROM members WHERE phone LIKE ? OR name LIKE ? ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`)
    .all(`%${search}%`, `%${search}%`, limit, (page - 1) * limit);
  const total = db.prepare('SELECT COUNT(*) c FROM members WHERE phone LIKE ? OR name LIKE ?').get(`%${search}%`, `%${search}%`).c;

  res.render('dashboard', {
    members: rows.map(memberWithStats),
    search, page, sort, order,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    username: req.session.username,
  });
});

router.post('/members', requireLogin, (req, res) => {
  db.prepare('INSERT INTO members (name, phone) VALUES (?, ?)').run(req.body.name, req.body.phone);
  res.redirect('/dashboard');
});

router.get('/members/:id', requireLogin, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).send('no such member');
  const history = db.prepare('SELECT * FROM transactions WHERE member_id = ? ORDER BY created_at DESC').all(member.id);
  res.render('member', { member: memberWithStats(member), history, error: req.query.error || null });
});

router.post('/members/:id/purchase', requireLogin, (req, res) => {
  recordPurchase(req.params.id, parseFloat(req.body.amount));
  res.redirect(`/members/${req.params.id}`);
});

router.post('/members/:id/redeem', requireLogin, (req, res) => {
  try {
    redeemTxn(req.params.id, parseInt(req.body.points), req.body.item);
    res.redirect(`/members/${req.params.id}`);
  } catch (e) {
    res.redirect(`/members/${req.params.id}?error=${encodeURIComponent(e.message)}`);
  }
});

// JSON API - same stuff as above, for the README + testing with curl/postman
router.get('/api/members', requireLogin, (req, res) => {
  const search = req.query.search || '';
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = parseInt(req.query.limit) || 10;
  const sort = req.query.sort === 'created_at' ? 'created_at' : 'name';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const rows = db.prepare(`SELECT * FROM members WHERE phone LIKE ? OR name LIKE ? ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`)
    .all(`%${search}%`, `%${search}%`, limit, (page - 1) * limit);
  res.json(rows.map(memberWithStats));
});

router.get('/api/members/:id', requireLogin, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'not found' });
  res.json(memberWithStats(member));
});

router.get('/api/members/:id/transactions', requireLogin, (req, res) => {
  res.json(db.prepare('SELECT * FROM transactions WHERE member_id = ? ORDER BY created_at DESC').all(req.params.id));
});

router.post('/api/members', requireLogin, express.json(), (req, res) => {
  const info = db.prepare('INSERT INTO members (name, phone) VALUES (?, ?)').run(req.body.name, req.body.phone);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/api/members/:id/purchase', requireLogin, express.json(), (req, res) => {
  const points = recordPurchase(req.params.id, parseFloat(req.body.amount));
  res.json({ pointsEarned: points, balance: currentBalance(req.params.id) });
});

router.post('/api/members/:id/redeem', requireLogin, express.json(), (req, res) => {
  try {
    res.json({ balance: redeemTxn(req.params.id, parseInt(req.body.points), req.body.item) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;