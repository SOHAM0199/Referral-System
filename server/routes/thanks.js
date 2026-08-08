const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { generateThankYouLetter } = require('../utils/thankYouGenerator');

const router = express.Router();

// POST /api/referrals/:referralId/thank  { personalNote }
router.post('/:referralId/thank', requireAuth, (req, res) => {
  const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.referralId);
  if (!referral) return res.status(404).json({ error: 'Referral not found.' });
  if (referral.requester_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the person who received this referral can send the thank-you.' });
  }

  const already = db.prepare('SELECT id FROM thanks WHERE referral_id = ?').get(referral.id);
  if (already) return res.status(409).json({ error: 'You\u2019ve already sent a thank-you for this referral.' });

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(referral.request_id);
  const referrer = db.prepare('SELECT * FROM users WHERE id = ?').get(referral.referrer_id);

  const { personalNote } = req.body || {};
  const letter = generateThankYouLetter({
    fromName: req.user.name,
    toName: referrer.name,
    requestTitle: request ? request.title : 'the role',
    personalNote,
  });

  const insert = db.prepare(`
    INSERT INTO thanks (referral_id, from_user_id, to_user_id, personal_note, letter)
    VALUES (?, ?, ?, ?, ?)
  `).run(referral.id, req.user.id, referrer.id, (personalNote || '').trim() || null, letter);

  db.prepare(`UPDATE requests SET status = 'thanked', updated_at = datetime('now') WHERE id = ?`).run(referral.request_id);

  notify(
    referrer.id,
    'thanked',
    `${req.user.name} sent you a thank-you letter for referring them.`,
    'thanks',
    insert.lastInsertRowid
  );

  const thanks = db.prepare('SELECT * FROM thanks WHERE id = ?').get(insert.lastInsertRowid);
  res.status(201).json({ thanks });
});

module.exports = router;
