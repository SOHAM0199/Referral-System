# Deployment Guide: Zero-Database Setup

The Referral Desk now supports **SQLite Zero-Database Mode**. You do not need to create any MySQL databases, user accounts, or import phpMyAdmin tables!

---

## Simple 2-Step Deployment

### Step 1: Upload Project Files
Select the following files/folders from `referral-portal/` and upload them to your hosting server's public folder (usually `public_html`):

```
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── api.js
│   └── app.js
└── api/
    ├── config.php
    ├── auth.php
    ├── requests.php
    ├── connections.php
    ├── referrals.php
    ├── thanks.php
    ├── rankings.php
    ├── notifications.php
    └── invites.php
```

---

### Step 2: Open Your Website
Open your website URL in any browser. The application automatically initializes its database file (`database.sqlite`) and creates all required tables on first load!

---

### Optional: MySQL Mode
If you ever want to switch back to MySQL:
1. Open `api/config.php`.
2. Change `define('DB_ENGINE', 'sqlite');` to `define('DB_ENGINE', 'mysql');`.
3. Set your MySQL credentials (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).

---

## Step 4: First-Time Setup & Bootstrapping Admin Account
1. Open your website domain in a browser (e.g., `https://yourdomain.com`).
2. The registration tab will be active for the **very first user**.
3. Fill in your name, email, and password to register your account.
4. **The first registered account automatically becomes the Admin!**
5. As Admin, navigate to the **Invites** tab in the top bar to create invite links or add new members directly.

---

## Troubleshooting & Tips
- **Sessions**: Ensure PHP sessions are enabled on your server (default on 99% of hosts).
- **HTTPS**: Recommended for secure password handling and session cookies.
- **Permissions**: Make sure PHP has read permissions for files and folders.
