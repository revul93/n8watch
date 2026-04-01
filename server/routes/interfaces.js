'use strict';

const express = require('express');
const router  = express.Router();
const { getConfig } = require('../config');

// GET /api/interfaces
// Returns the list of network interfaces defined in config.yaml.
router.get('/', (req, res) => {
  try {
    const config = getConfig();
    const interfaces = Array.isArray(config.interfaces) ? config.interfaces : [];
    res.json({ interfaces });
  } catch (err) {
    console.error('[Routes/interfaces] GET /:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
