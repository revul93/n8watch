'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { broadcast } = require('../websocket');
const { getConfig } = require('../config');

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
    const { name, ip, interface: iface, interface_alias: ifaceAlias, lifetime_days } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!ip || typeof ip !== 'string' || !ip.trim()) {
      return res.status(400).json({ error: 'ip is required' });
    }

    const config = getConfig();
    const maxDays = config.general.max_user_target_lifetime_days;

    let lifetimeDays = maxDays;
    if (lifetime_days !== undefined && lifetime_days !== null) {
      const parsed = parseInt(lifetime_days, 10);
      if (isNaN(parsed) || parsed < 1) {
        return res.status(400).json({ error: 'lifetime_days must be a positive integer' });
      }
      if (parsed > maxDays) {
        return res.status(400).json({ error: `lifetime_days cannot exceed ${maxDays}` });
      }
      lifetimeDays = parsed;
    }

    const trimmedName       = name.trim().slice(0, 100);
    const trimmedIp         = ip.trim().slice(0, 253);
    const trimmedIface      = (iface && typeof iface === 'string' && iface.trim()) ? iface.trim().slice(0, 64) : null;
    const trimmedIfaceAlias = (ifaceAlias && typeof ifaceAlias === 'string' && ifaceAlias.trim()) ? ifaceAlias.trim().slice(0, 100) : null;

    const id = db.addUserTarget(trimmedName, trimmedIp, trimmedIface, trimmedIfaceAlias, lifetimeDays);
    const targets = db.getAllTargetsWithLatest();
    const target  = targets.find(t => t.id === id) || { id, name: trimmedName, ip: trimmedIp, is_user_target: 1 };
    res.status(201).json({ target });

    // Notify all connected clients so they refetch targets without a page reload
    broadcast('targets_changed', { action: 'added', target_id: id });
  } catch (err) {
    if (err.code === 'UNIQUE_IP_INTERFACE' || (err.message && err.message.includes('UNIQUE constraint'))) {
      return res.status(409).json({ error: 'A target with this IP and interface combination already exists' });
    }
    console.error('[Routes/targets] POST /user-targets:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/user-targets/:id — edit an active temporary user-defined target
router.patch('/user-targets/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const { name, ip, interface: iface, interface_alias: ifaceAlias, lifetime_days } = req.body || {};
    const fields = {};
    if (name !== undefined) fields.name = String(name).slice(0, 100);
    if (ip !== undefined) fields.ip = String(ip).slice(0, 253);
    if (iface !== undefined) fields.interface = iface ? String(iface).slice(0, 64) : null;
    if (ifaceAlias !== undefined) fields.interface_alias = ifaceAlias ? String(ifaceAlias).slice(0, 100) : null;
    if (lifetime_days !== undefined && lifetime_days !== null && lifetime_days !== '') {
      const parsed = parseInt(lifetime_days, 10);
      if (isNaN(parsed) || parsed < 1) return res.status(400).json({ error: 'lifetime_days must be a positive integer' });
      const maxDays = getConfig().general.max_user_target_lifetime_days;
      if (parsed > maxDays) return res.status(400).json({ error: `lifetime_days cannot exceed ${maxDays}` });
      fields.lifetime_days = parsed;
    }

    const updated = db.updateUserTarget(id, fields);
    if (!updated) return res.status(404).json({ error: 'Editable temporary target not found' });

    res.json({ target: updated });
    broadcast('targets_changed', { action: 'updated', target_id: id });
  } catch (err) {
    if (err.code === 'UNIQUE_IP_INTERFACE') {
      return res.status(409).json({ error: 'A target with this IP and interface combination already exists' });
    }
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[Routes/targets] PATCH /user-targets/:id:', err.message);
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

    // Notify all connected clients so they refetch targets without a page reload
    broadcast('targets_changed', { action: 'deleted', target_id: id });
  } catch (err) {
    console.error('[Routes/targets] DELETE /user-targets/:id:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
