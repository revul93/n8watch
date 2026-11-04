'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { broadcast } = require('../websocket');

// GET /api/groups — all temp groups with their member target ids
router.get('/', (req, res) => {
  try {
    res.json({ groups: db.listTempGroups() });
  } catch (err) {
    console.error('[Routes/groups] GET /:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/groups — create a temp group { name, color?, target_ids? }
router.post('/', (req, res) => {
  try {
    const { name, color, target_ids } = req.body || {};
    const group = db.createTempGroup(name, color);
    if (Array.isArray(target_ids) && target_ids.length) {
      db.setTempGroupMembers(group.id, target_ids);
    }
    res.status(201).json({ group: db.listTempGroups().find((g) => g.id === group.id) || group });
    broadcast('groups_changed', { action: 'created', group_id: group.id });
  } catch (err) {
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[Routes/groups] POST /:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/groups/:id — rename / recolor
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid group id' });
    const updated = db.updateTempGroup(id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Group not found' });
    res.json({ group: updated });
    broadcast('groups_changed', { action: 'updated', group_id: id });
  } catch (err) {
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[Routes/groups] PATCH /:id:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid group id' });
    const deleted = db.deleteTempGroup(id);
    if (!deleted) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
    broadcast('groups_changed', { action: 'deleted', group_id: id });
  } catch (err) {
    console.error('[Routes/groups] DELETE /:id:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/groups/:id/members — replace the full member set { target_ids: [] }
router.put('/:id/members', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid group id' });
    const { target_ids } = req.body || {};
    if (!Array.isArray(target_ids)) return res.status(400).json({ error: 'target_ids array is required' });
    const ids = db.setTempGroupMembers(id, target_ids);
    if (ids === null) return res.status(404).json({ error: 'Group not found' });
    res.json({ group_id: id, target_ids: ids });
    broadcast('groups_changed', { action: 'members', group_id: id });
  } catch (err) {
    console.error('[Routes/groups] PUT /:id/members:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/groups/:id/members — add one { target_id }
router.post('/:id/members', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const targetId = parseInt((req.body || {}).target_id, 10);
    if (isNaN(id) || isNaN(targetId)) return res.status(400).json({ error: 'Invalid id' });
    db.addTempGroupMember(id, targetId);
    res.json({ success: true });
    broadcast('groups_changed', { action: 'members', group_id: id });
  } catch (err) {
    console.error('[Routes/groups] POST /:id/members:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/groups/:id/members/:targetId — remove one
router.delete('/:id/members/:targetId', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const targetId = parseInt(req.params.targetId, 10);
    if (isNaN(id) || isNaN(targetId)) return res.status(400).json({ error: 'Invalid id' });
    db.removeTempGroupMember(id, targetId);
    res.json({ success: true });
    broadcast('groups_changed', { action: 'members', group_id: id });
  } catch (err) {
    console.error('[Routes/groups] DELETE /:id/members/:targetId:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
