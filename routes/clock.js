const express = require('express');

const {
  setNow,
  getNow,
  expireAllStalePoints
} = require('../services/loyalty');

const { requireLogin } = require('../middleware/auth');

const router = express.Router();


// ============================================
// GET CURRENT SIMULATED CLOCK
// ============================================

router.get(
  '/clock',
  requireLogin,
  (req, res) => {

    res.json({
      now: getNow()
    });
  }
);


// ============================================
// POST /clock
// ============================================

router.post(
  '/clock',
  requireLogin,
  (req, res) => {

    try {

      const requestedTime =
        req.body.now ||
        req.body.current_time;

      if (!requestedTime) {
        return res.status(400).json({
          error: 'Provide now'
        });
      }


      const now =
        setNow(requestedTime);


      const expiredPoints =
        expireAllStalePoints();


      res.json({
        success: true,
        now,
        expiredPoints
      });

    } catch (error) {

      res.status(400).json({
        error: error.message
      });
    }
  }
);


module.exports = router;