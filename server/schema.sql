-- Referral Portal database schema
-- Applied automatically on server start (server/db.js). Safe to re-run: uses IF NOT EXISTS everywhere.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  invite_id     INTEGER REFERENCES invites(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT,
  created_by  INTEGER REFERENCES users(id),
  max_uses    INTEGER NOT NULL DEFAULT 0,   -- 0 = unlimited
  uses        INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A referral request is a member describing what kind of referral they need
-- (role, company, team — e.g. "Finance Analyst @ Acme, referral needed for the FP&A team").
CREATE TABLE IF NOT EXISTS requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id  INTEGER NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','connected','referred','thanked','closed')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A connection is a referrer raising their hand on a request. Requester is notified.
-- Multiple members can connect on the same request; the requester picks who actually refers them.
CREATE TABLE IF NOT EXISTS connections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL REFERENCES requests(id),
  referrer_id   INTEGER NOT NULL REFERENCES users(id),
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'connected'
                CHECK (status IN ('connected','referred','declined')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, referrer_id)
);

-- The referral itself: the referrer's description of the referral they made.
CREATE TABLE IF NOT EXISTS referrals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL UNIQUE REFERENCES connections(id),
  request_id    INTEGER NOT NULL REFERENCES requests(id),
  referrer_id   INTEGER NOT NULL REFERENCES users(id),
  requester_id  INTEGER NOT NULL REFERENCES users(id),
  description   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A generated thank-you letter, written once the requester marks the referral as done.
CREATE TABLE IF NOT EXISTS thanks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_id   INTEGER NOT NULL UNIQUE REFERENCES referrals(id),
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  to_user_id    INTEGER NOT NULL REFERENCES users(id),
  personal_note TEXT,
  letter        TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL, -- connected | referred | thanked | commented
  message       TEXT NOT NULL,
  related_type  TEXT,          -- request | referral | thanks
  related_id    INTEGER,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_connections_request ON connections(request_id);
CREATE INDEX IF NOT EXISTS idx_connections_referrer ON connections(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_requester ON referrals(requester_id);
CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
