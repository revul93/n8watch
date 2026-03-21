'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/targets/:id/export  (CSV download)
router.get('/:id/export', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    const { from, to } = req.query;
    // Fetch up to 100,000 rows for export
    const { rows } = db.getPingResults(id, from, to, 100000, 0);

    const headers = [
      'id', 'target_id', 'is_alive', 'min_latency', 'avg_latency',
      'max_latency', 'jitter', 'packet_loss', 'packets_sent', 'packets_received', 'created_at',
    ];

    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          // Quote strings that may contain commas
          const str = String(val);
          return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
      ),
    ];

    const filename = `${target.name.replace(/\s+/g, '_')}_${id}_export.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    console.error('[Routes/export] GET /:id/export:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
