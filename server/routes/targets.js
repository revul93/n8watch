'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/targets
router.get('/', (req, res) => {
  try {
    const targets = db.getAllTargetsWithLatest();
    res.json({ targets });
  } catch (err) {
    console.error('[Routes/targets] GET /:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/targets/:id
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    res.json({ target });
  } catch (err) {
    console.error('[Routes/targets] GET /:id:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
