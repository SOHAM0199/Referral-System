const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../utils/notify');

const router = express.Router();

// POST /api/connections/:connectionId/refer  { description }
// The referrer (who already connected) writes up the referral they made.
router.post('/:connectionId/refer', requireAuth, (req, res) => {
  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.connectionId);
  if (!connection) return res.status(404).json({ error: 'Connection not found.' });
  if (connection.referrer_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the member who connected can submit this referral.' });
  }
  if (connection.status === 'referred') {
    return res.status(409).json({ error: 'You\u2019ve already submitted a referral for this connection.' });
  }

  const { description } = req.body || {};
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Describe the referral you made.' });
  }

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(connection.request_id);
  if (!request) return res.status(404).json({ error: 'The original request no longer exists.' });

  const insert = db.prepare(`
    INSERT INTO referrals (connection_id, request_id, referrer_id, requester_id, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(connection.id, request.id, req.user.id, request.requester_id, description.trim());

  db.prepare(`UPDATE connections SET status = 'referred' WHERE id = ?`).run(connection.id);
  db.prepare(`UPDATE requests SET status = 'referred', updated_at = datetime('now') WHERE id = ?`).run(request.id);

  notify(
    request.requester_id,
    'referred',
    `${req.user.name} sent your referral for "${request.title}". Take a look and send a thank-you when you\u2019re ready.`,
    'referral',
    insert.lastInsertRowid
  );

  const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(insert.lastInsertRowid);
  res.status(201).json({ referral });
});

module.exports = router;
