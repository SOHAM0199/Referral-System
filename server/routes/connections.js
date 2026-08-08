const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../utils/notify');

const router = express.Router();

// POST /api/requests/:requestId/connect  { note }  -- referrer connects with the requester
router.post('/:requestId/connect', requireAuth, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.requester_id === req.user.id) {
    return res.status(400).json({ error: 'You can\u2019t connect to your own request.' });
  }
  if (request.status === 'closed') {
    return res.status(400).json({ error: 'This request is closed.' });
  }

  const already = db.prepare('SELECT id FROM connections WHERE request_id = ? AND referrer_id = ?')
    .get(request.id, req.user.id);
  if (already) return res.status(409).json({ error: 'You\u2019ve already connected on this request.' });

  const { note } = req.body || {};
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'Please give your referral details here.' });
  }

  const result = db.prepare(`
    INSERT INTO connections (request_id, referrer_id, note)
    VALUES (?, ?, ?)
  `).run(request.id, req.user.id, note.trim());

  if (request.status === 'open') {
    db.prepare(`UPDATE requests SET status = 'connected', updated_at = datetime('now') WHERE id = ?`).run(request.id);
  }

  notify(
    request.requester_id,
    'connected',
    `${req.user.name} has connected with you and can refer you for "${request.title}".`,
    'request',
    request.id
  );

  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ connection });
});

module.exports = router;
