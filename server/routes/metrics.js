'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

const INTERVAL_MAP = {
  '1m':  60,
  '5m':  300,
  '15m': 900,
  '30m': 1800,
  '1h':  3600,
  '6h':  21600,
  '1d':  86400,
};

// GET /api/targets/:id/metrics
router.get('/:id/metrics', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const { from, to } = req.query;
    const intervalStr  = req.query.interval || '5m';
    const intervalSec  = INTERVAL_MAP[intervalStr] || parseInt(intervalStr, 10) || 300;

    const metrics = db.getMetrics(id, from, to, intervalSec);
    res.json({ target_id: id, interval: intervalStr, interval_seconds: intervalSec, metrics });
  } catch (err) {
    console.error('[Routes/metrics] GET /:id/metrics:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/targets/:id/uptime
router.get('/:id/uptime', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const uptime = db.getUptime(id);
    res.json({ target_id: id, ...uptime });
  } catch (err) {
    console.error('[Routes/metrics] GET /:id/uptime:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
