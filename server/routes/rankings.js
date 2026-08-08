const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/rankings - members ranked by referrals given (and thank-yous received as a tiebreaker signal)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.name,
      COUNT(DISTINCT r.id) AS referrals_made,
      COUNT(DISTINCT t.id) AS thanks_received,
      COUNT(DISTINCT c.id) AS connections_made
    FROM users u
    LEFT JOIN referrals r ON r.referrer_id = u.id
    LEFT JOIN thanks t ON t.to_user_id = u.id
    LEFT JOIN connections c ON c.referrer_id = u.id
    GROUP BY u.id
    HAVING referrals_made > 0 OR connections_made > 0
    ORDER BY referrals_made DESC, thanks_received DESC, connections_made DESC
  `).all();

  res.json({ rankings: rows });
});

module.exports = router;
