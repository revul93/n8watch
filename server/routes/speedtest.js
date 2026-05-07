'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { isSpeedtestAvailable, isFastAvailable } = require('../speedtest-engine');

// GET /api/speedtest/results
// Query params: from, to (ms or ISO timestamps), limit (default 100, max 1000)
router.get('/results', (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const rows = db.getSpeedtestResults({ from, to, limit });
    res.json({ results: rows, count: rows.length });
  } catch (err) {
    console.error('[Routes/speedtest] GET /results:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/speedtest/latest
router.get('/latest', (req, res) => {
  try {
    const result = db.getLatestSpeedtestResult();
    res.json({ result });
  } catch (err) {
    console.error('[Routes/speedtest] GET /latest:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/speedtest/tools  — which CLI tools are installed on this host
router.get('/tools', async (req, res) => {
  try {
    const [speedtest, fast] = await Promise.all([
      isSpeedtestAvailable(),
      isFastAvailable(),
    ]);
    res.json({ speedtest, fast });
  } catch (err) {
    console.error('[Routes/speedtest] GET /tools:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
