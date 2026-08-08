const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function setAuthCookie(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, COOKIE_OPTS);
}

// POST /api/auth/register  { name, email, password, inviteCode }
router.post('/register', (req, res) => {
  const { name, email, password, inviteCode } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Add your name.' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Add a valid email.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password needs at least 6 characters.' });
  if (!inviteCode || !inviteCode.trim()) return res.status(400).json({ error: 'An invite link is required to join.' });

  const invite = db.prepare('SELECT * FROM invites WHERE code = ? AND is_active = 1').get(inviteCode.trim());
  if (!invite) return res.status(400).json({ error: 'That invite link is invalid or has been switched off.' });
  if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
    return res.status(400).json({ error: 'That invite link has reached its member limit.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const isFirstUser = db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0;

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, is_admin, invite_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = insertUser.run(name.trim(), email.toLowerCase().trim(), passwordHash, isFirstUser ? 1 : 0, invite.id);

  db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(invite.id);

  const user = { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim(), is_admin: isFirstUser ? 1 : 0 };
  setAuthCookie(res, user);
  res.status(201).json({ user });
});

// POST /api/auth/login { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'That email and password don\u2019t match.' });
  }

  setAuthCookie(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
});

// GET /api/auth/status - check if an admin user has been created
router.get('/status', (req, res) => {
  const hasAdmin = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c > 0;
  res.json({ hasAdmin });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { maxAge, ...clearOpts } = COOKIE_OPTS;
  res.clearCookie('token', clearOpts);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
