'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/dashboard/summary
router.get('/summary', (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    res.json({ summary });
  } catch (err) {
    console.error('[Routes/dashboard] GET /summary:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
