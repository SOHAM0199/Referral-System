# The Referral Desk

An invite-only referral portal. Members join via an invite link, post what
kind of referral they need (role, company, team), get connected with someone
who can refer them, receive the referral, and send back a generated
thank-you letter. A rankings tab tracks who has referred the most people.

Backend: Node.js + Express + SQLite (`better-sqlite3`, zero external DB to
provision). Frontend: a single-page vanilla HTML/CSS/JS app served as static
files by the same Express server — no build step, no framework version drift.

---

## How the flow works

1. **Join** — an admin generates an invite link (`/?invite=CODE`). Anyone who
   registers through it becomes a member. The very first person to register
   automatically becomes the admin.
2. **Ask** — a member posts a request: a title (e.g. "Finance Analyst @ Acme
   Corp") and a description of exactly what they need.
3. **Connect** — another member who can help clicks **"I can connect & refer"**.
   The requester is notified that this person has connected and can refer them.
4. **Refer** — the connector then submits the actual referral write-up (who
   they spoke to, what they shared) in a description box of its own.
5. **Thank** — once the requester has what they need, they click **"Say thank
   you"**. The server generates a formatted thank-you letter and delivers it
   straight to the referrer's screen with a wax-seal reveal animation.
6. **Rankings** — a leaderboard tab ranks members by referrals made, with
   thank-yous received and connections made as supporting columns.

---

## Project structure

```
referral-portal/
├── package.json
├── .env.example          # copy to .env before running
├── server/
│   ├── index.js           # Express app entry point
│   ├── db.js               # opens SQLite, applies schema.sql on boot
│   ├── schema.sql           # full table definitions
│   ├── middleware/
│   │   └── auth.js           # JWT cookie auth + admin guard
│   ├── routes/
│   │   ├── auth.js            # register / login / logout / me
│   │   ├── invites.js          # admin: create + list invite links
│   │   ├── requests.js          # create/list referral requests
│   │   ├── connections.js        # referrer connects to a request
│   │   ├── referrals.js           # referrer submits the referral write-up
│   │   ├── thanks.js               # requester sends the thank-you letter
│   │   ├── rankings.js              # leaderboard query
│   │   └── notifications.js          # per-user notification feed
│   └── utils/
│       ├── notify.js               # shared "insert a notification" helper
│       ├── thankYouGenerator.js     # builds the letter text
│       └── createAdmin.js            # one-time bootstrap script
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js           # fetch wrapper for every endpoint
│       └── app.js            # views, rendering, event wiring
└── data/                  # SQLite file lives here at runtime (gitignored)
```

Every route file owns one resource and does its own input validation, so
there's no shared mutable state to get tangled — each endpoint can be tested
or changed in isolation.

---

## Run it locally

Requires Node.js 18+.

```bash
cd referral-portal
npm install
cp .env.example .env        # then edit JWT_SECRET to a real random string
npm run seed:admin          # prints the first invite link
npm start
```

Open the printed invite link (something like
`http://localhost:3000/?invite=abc123`) in your browser and register — that
account becomes the admin. From the **Invites** tab, the admin can create
more invite links for everyone else to join with.

---

## Deploying it live

This app is a single Node process with a SQLite file on disk — no separate
database service to provision. It runs well on **Render**, **Railway**, or
any host that keeps a persistent disk.

### Render.com (recommended, free tier available)

1. Push this project to a GitHub repo.
2. In Render, **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a **persistent disk** (Render dashboard → your service → Disks) mounted
   at `/opt/render/project/src/data` — this is required so the SQLite file
   survives restarts and redeploys. Without a persistent disk, every deploy
   wipes the database.
6. Environment variables: set `JWT_SECRET` to a long random string, and
   `NODE_ENV=production`.
7. Deploy, then open the live URL, run the invite-link step once via a Render
   **Shell** (`npm run seed:admin`), and register as the admin.

### Railway / Fly.io / a VPS

Same idea: `npm install && npm start`, a persistent volume for `/data`, and
`JWT_SECRET` set as an environment variable. On a plain VPS, run it behind
`pm2` or `systemd` and put Nginx in front for TLS.

### Common pitfalls this structure avoids

- **No build step** — the frontend is plain HTML/CSS/JS, so there's no
  bundler config to get wrong across environments.
- **No separate database to wire up** — SQLite is a single file; just make
  sure the host's disk is persistent (see above).
- **`better-sqlite3` is a native module** — if a host's build step fails on
  it, use a Node 18+ or 20+ build image (its prebuilt binaries cover those)
  rather than an unusual Node version.
- **Cookies over HTTPS** — `NODE_ENV=production` makes the login cookie
  `secure`, which requires HTTPS. Every host above provides HTTPS by default;
  if you put this behind your own reverse proxy, make sure TLS is terminated
  before the app, or the cookie won't be set.

---

## API overview

All endpoints are under `/api` and (aside from `/api/auth/*`) require a
signed-in session cookie.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Join with `{ name, email, password, inviteCode }` |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | Clears the session |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/invites` | List / create invite links (admin only) |
| PATCH | `/api/invites/:id/toggle` | Enable/disable a link (admin only) |
| GET/POST | `/api/requests` | Browse the feed / post a new request |
| GET | `/api/requests/mine` | Your own requests with full thread |
| GET | `/api/requests/referring` | Requests you've connected to |
| POST | `/api/requests/:id/connect` | Connect with a requester |
| POST | `/api/connections/:id/refer` | Submit your referral write-up |
| POST | `/api/referrals/:id/thank` | Send the thank-you letter |
| GET | `/api/rankings` | Leaderboard |
| GET | `/api/notifications` | Your notifications |
| POST | `/api/notifications/read-all` | Mark all read |

---

## Notes

- Passwords are hashed with bcrypt; sessions are signed JWTs in an
  `httpOnly` cookie — never stored in `localStorage`.
- SQLite runs in WAL mode for reasonable concurrent read/write performance
  at small-to-medium scale (a single referral-desk community). If the portal
  grows to many concurrent writers, swapping `better-sqlite3` for Postgres
  is a matter of rewriting `server/db.js` and the `INSERT`/`SELECT` calls —
  the schema and route logic carry over directly.
