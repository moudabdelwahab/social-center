'use strict';
const express = require('express');
const { db } = require('../db');
const { wrap } = require('../utils/errors');
const { CAPABILITIES } = require('../integrations/providers');

const r = express.Router();

// المنصات المتاحة وقدرات كل منصة (Capabilities per Provider)
r.get('/platforms', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT code, name, enabled FROM social_platforms`).all();
  res.json({
    items: rows.map((p) => ({ ...p, capabilities: CAPABILITIES[p.code] || CAPABILITIES.mock }))
  });
}));

module.exports = r;
