const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const notify = require('../utils/notify');

const router = express.Router();

function attachThread(request) {
  const connections = db.prepare(`
    SELECT c.*, u.name AS referrer_name
    FROM connections c JOIN users u ON u.id = c.referrer_id
    WHERE c.request_id = ?
    ORDER BY c.created_at ASC
  `).all(request.id);

  const referral = db.prepare(`
    SELECT r.*, ur.name AS referrer_name, uq.name AS requester_name
    FROM referrals r
    JOIN users ur ON ur.id = r.referrer_id
    JOIN users uq ON uq.id = r.requester_id
    WHERE r.request_id = ?
  `).get(request.id);

  let thanks = null;
  if (referral) {
    thanks = db.prepare('SELECT * FROM thanks WHERE referral_id = ?').get(referral.id) || null;
  }

  const comments = db.prepare(`
    SELECT cm.*, u.name AS author_name
    FROM comments cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.request_id = ?
    ORDER BY cm.created_at ASC
  `).all(request.id);

  return { ...request, connections, referral: referral || null, thanks, comments };
}

// POST /api/requests  { title, description }
router.post('/', requireAuth, (req, res) => {
  const { title, description } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Give the request a short title, e.g. the role and company.' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Describe what referral you need.' });

  const result = db.prepare(`
    INSERT INTO requests (requester_id, title, description)
    VALUES (?, ?, ?)
  `).run(req.user.id, title.trim(), description.trim());

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ request: attachThread(request) });
});

// GET /api/requests  - feed of everyone's requests (newest first)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT req.*, u.name AS requester_name,
      (SELECT COUNT(*) FROM connections c WHERE c.request_id = req.id) AS connection_count
    FROM requests req
    JOIN users u ON u.id = req.requester_id
    ORDER BY req.created_at DESC
  `).all();

  const requests = rows.map((r) => {
    const thread = attachThread(r);
    return { ...thread, requester_name: r.requester_name, connection_count: r.connection_count };
  });

  res.json({ requests });
});

// POST /api/requests/:id/comments { content }
router.post('/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Enter your reply or comment.' });

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  const result = db.prepare(`
    INSERT INTO comments (request_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(request.id, req.user.id, content.trim());

  if (request.requester_id !== req.user.id) {
    notify(
      request.requester_id,
      'commented',
      `${req.user.name} replied on your request "${request.title}"`,
      'request',
      request.id
    );
  }

  const comment = db.prepare(`
    SELECT cm.*, u.name AS author_name
    FROM comments cm JOIN users u ON u.id = cm.user_id
    WHERE cm.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ comment });
});

// GET /api/requests/mine - the current user's own requests, with full thread
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM requests WHERE requester_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ requests: rows.map(attachThread) });
});

// GET /api/requests/referring - requests the current user has connected to / is referring on
router.get('/referring', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT req.*, u.name AS requester_name
    FROM requests req
    JOIN connections c ON c.request_id = req.id
    JOIN users u ON u.id = req.requester_id
    WHERE c.referrer_id = ?
    ORDER BY req.created_at DESC
  `).all(req.user.id);
  res.json({ requests: rows.map(r => ({ ...attachThread(r), requester_name: r.requester_name })) });
});

// GET /api/requests/:id - single request with full thread
router.get('/:id', requireAuth, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  res.json({ request: attachThread(request) });
});

// DELETE /api/requests/:id (owner or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  if (request.requester_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'You can only delete your own requests.' });
  }

  db.prepare('DELETE FROM comments WHERE request_id = ?').run(request.id);
  db.prepare('DELETE FROM thanks WHERE referral_id IN (SELECT id FROM referrals WHERE request_id = ?)').run(request.id);
  db.prepare('DELETE FROM referrals WHERE request_id = ?').run(request.id);
  db.prepare('DELETE FROM connections WHERE request_id = ?').run(request.id);
  db.prepare('DELETE FROM notifications WHERE related_type = \'request\' AND related_id = ?').run(request.id);
  db.prepare('DELETE FROM requests WHERE id = ?').run(request.id);

  res.json({ ok: true });
});

module.exports = router;
