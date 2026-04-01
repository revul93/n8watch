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

// GET /api/targets/:id/report  (comprehensive report data as JSON)
router.get('/:id/report', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid target id' });

    const target = db.getTargetById(id);
    if (!target) return res.status(404).json({ error: 'Target not found' });

    // Uptime statistics
    const uptime = db.getUptime(id);

    // Metrics over the past 24 hours (5-minute buckets)
    const metricsFrom = Date.now() - 86400000;
    const metrics = db.getMetrics(id, metricsFrom, Date.now(), 300);

    // Recent ping results (last 200 samples)
    const { rows: pingRows } = db.getPingResults(id, metricsFrom, Date.now(), 200, 0);

    // Alert history for this target (last 100)
    const { rows: alertRows } = db.getAlerts({ target_id: id, limit: 100 });

    res.json({
      generated_at: new Date().toISOString(),
      target: {
        id:              target.id,
        name:            target.name,
        ip:              target.ip,
        group:           target.group,
        interface:       target.interface || null,
        interface_alias: target.interface_alias || null,
        is_alive:        target.is_alive,
        avg_latency:     target.avg_latency,
        packet_loss:     target.packet_loss,
      },
      uptime,
      metrics,
      ping_results: pingRows,
      alerts: alertRows,
    });
  } catch (err) {
    console.error('[Routes/export] GET /:id/report:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
