'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

const SERVER_START_TIME = Date.now();

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

// GET /api/dashboard/system  — server start time and uptime
router.get('/system', (req, res) => {
  try {
    const now = Date.now();
    res.json({
      started_at:      SERVER_START_TIME,
      uptime_seconds:  Math.floor((now - SERVER_START_TIME) / 1000),
    });
  } catch (err) {
    console.error('[Routes/dashboard] GET /system:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
