'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/alerts
router.get('/', (req, res) => {
  try {
    const { severity, target_id, resolved, from, to, limit, offset } = req.query;
    const result = db.getAlerts({ severity, target_id, resolved, from, to, limit, offset });
    res.json(result);
  } catch (err) {
    console.error('[Routes/alerts] GET /:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/alerts/active
router.get('/active', (req, res) => {
  try {
    const alerts = db.getActiveAlerts();
    res.json({ alerts });
  } catch (err) {
    console.error('[Routes/alerts] GET /active:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
