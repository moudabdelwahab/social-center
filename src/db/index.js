'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/** تنسيق UTC موحد: 'YYYY-MM-DD HH:MM:SS' (متوافق مع datetime('now') في SQLite) */
function nowUtc(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { db, nowUtc };
