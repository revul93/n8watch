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

// POST /api/user-targets — add a temporary user-defined target
router.post('/user-targets', (req, res) => {
  try {
    const { name, ip } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!ip || typeof ip !== 'string' || !ip.trim()) {
      return res.status(400).json({ error: 'ip is required' });
    }

    const trimmedName = name.trim().slice(0, 100);
    const trimmedIp   = ip.trim().slice(0, 253);

    const id = db.addUserTarget(trimmedName, trimmedIp);
    const targets = db.getAllTargetsWithLatest();
    const target  = targets.find(t => t.id === id) || { id, name: trimmedName, ip: trimmedIp, is_user_target: 1 };
    res.status(201).json({ target });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A target with this IP already exists' });
    }
    console.error('[Routes/targets] POST /user-targets:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/user-targets/:id — remove a temporary user-defined target
router.delete('/user-targets/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const deleted = db.deleteUserTarget(id);
    if (!deleted) return res.status(404).json({ error: 'User target not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[Routes/targets] DELETE /user-targets/:id:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
