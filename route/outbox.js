const express = require('express');

const { db } = require('../db');

const { requireLogin } = require('../middleware/auth');

const router = express.Router();


// ============================================
// GET OUTBOX
// ============================================

router.get(
  '/outbox',
  requireLogin,
  (req, res) => {

    const rows = db.prepare(`
      SELECT
        id,
        event_type,
        member_id,
        payload,
        created_at,
        processed_at

      FROM outbox

      ORDER BY
        created_at ASC,
        id ASC
    `).all();


    const events = rows.map(row => ({
      ...row,
      payload: JSON.parse(row.payload)
    }));


    res.json(events);
  }
);


module.exports = router;