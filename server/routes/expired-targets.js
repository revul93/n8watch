'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/targets/expired — list all archived expired user targets
router.get('/expired', (req, res) => {
  try {
    const targets = db.getExpiredTargets();
    res.json({ targets });
  } catch (err) {
    console.error('[Routes/expired-targets] GET /expired:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
