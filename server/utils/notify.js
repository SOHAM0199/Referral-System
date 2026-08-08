const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO notifications (user_id, type, message, related_type, related_id)
  VALUES (@user_id, @type, @message, @related_type, @related_id)
`);

function notify(userId, type, message, relatedType = null, relatedId = null) {
  insertStmt.run({
    user_id: userId,
    type,
    message,
    related_type: relatedType,
    related_id: relatedId,
  });
}

module.exports = { notify };
