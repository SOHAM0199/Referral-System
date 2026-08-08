const express = require('express');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/invites/members  (admin) - list all members with request and referral stats
router.get('/members', requireAuth, requireAdmin, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
           (SELECT COUNT(*) FROM requests r WHERE r.requester_id = u.id) AS request_count,
           (SELECT COUNT(*) FROM referrals ref WHERE ref.referrer_id = u.id) AS referral_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json({ members });
});

// POST /api/invites/members  (admin) { name, email, password } - create member directly
router.post('/members', requireAuth, requireAdmin, (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Add member name.' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Add a valid email.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password needs at least 6 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, is_admin)
    VALUES (?, ?, ?, 0)
  `).run(name.trim(), email.toLowerCase().trim(), passwordHash);

  const member = { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim(), is_admin: 0 };
  res.status(201).json({ member });
});

// DELETE /api/invites/members/:id  (admin only) - delete a member account
router.delete('/members/:id', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId) return res.status(400).json({ error: 'Invalid member ID.' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot delete your own admin account.' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Member not found.' });

  db.prepare('DELETE FROM comments WHERE user_id = ?').run(targetId);
  db.prepare('DELETE FROM thanks WHERE from_user_id = ? OR to_user_id = ?').run(targetId, targetId);
  db.prepare('DELETE FROM referrals WHERE referrer_id = ? OR requester_id = ?').run(targetId, targetId);
  db.prepare('DELETE FROM connections WHERE referrer_id = ? OR request_id IN (SELECT id FROM requests WHERE requester_id = ?)').run(targetId, targetId);
  db.prepare('DELETE FROM requests WHERE requester_id = ?').run(targetId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(targetId);
  db.prepare('UPDATE invites SET created_by = NULL WHERE created_by = ?').run(targetId);
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  res.json({ ok: true });
});

// GET /api/invites  (admin) - list all invite links with usage
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const invites = db.prepare(`
    SELECT i.*, u.name AS created_by_name
    FROM invites i
    LEFT JOIN users u ON u.id = i.created_by
    ORDER BY i.created_at DESC
  `).all();
  res.json({ invites });
});

// POST /api/invites  (admin) { label, maxUses }
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { label, maxUses } = req.body || {};
  const code = nanoid(10);

  const result = db.prepare(`
    INSERT INTO invites (code, label, created_by, max_uses)
    VALUES (?, ?, ?, ?)
  `).run(code, (label || '').trim() || null, req.user.id, Number(maxUses) > 0 ? Number(maxUses) : 0);

  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ invite });
});

// PATCH /api/invites/:id/toggle (admin) - enable/disable a link
router.patch('/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found.' });

  db.prepare('UPDATE invites SET is_active = ? WHERE id = ?').run(invite.is_active ? 0 : 1, invite.id);
  res.json({ ok: true });
});

module.exports = router;

