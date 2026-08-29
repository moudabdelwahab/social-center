'use strict';
const crypto = require('crypto');
const config = require('../config');

// AES-256-GCM لتشفير Access Tokens وأي بيانات حساسة قبل تخزينها
const KEY = crypto.scryptSync(config.encryptionSecret, 'scc-kdf-salt-v1', 32);

function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  const raw = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
