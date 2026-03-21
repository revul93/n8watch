'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });
const db      = require('../database');

// GET /api/targets/:id/ping-results
router.get('/targets/:id/ping-results', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const { from, to, limit = 100, offset = 0 } = req.query;
    const result = db.getPingResults(id, from, to, limit, offset);

    res.json(result);
  } catch (err) {
    console.error('[Routes/ping-results] GET /targets/:id/ping-results:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ping-results/latest
router.get('/latest', (req, res) => {
  try {
    const rows = db.getLatestPingResultForAll();
    res.json({ rows });
  } catch (err) {
    console.error('[Routes/ping-results] GET /latest:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
