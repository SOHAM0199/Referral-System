/**
 * Run once, before anyone has registered:
 *   npm run seed:admin
 *
 * Creates the first invite link. The first person who registers with it
 * automatically becomes an admin (see server/routes/auth.js), and can then
 * generate further invite links from the app itself.
 */
const { nanoid } = require('nanoid');
const db = require('../db');

const existingUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (existingUsers > 0) {
  console.log('Users already exist — sign in and create invite links from the app instead.');
  process.exit(0);
}

const code = nanoid(10);
db.prepare(`
  INSERT INTO invites (code, label, max_uses)
  VALUES (?, 'Founding invite', 1)
`).run(code);

console.log('\nFirst invite link created. Share this with the first admin:\n');
console.log(`  Invite code: ${code}\n`);
console.log('Open the app and register with this code — that account becomes the admin.\n');
