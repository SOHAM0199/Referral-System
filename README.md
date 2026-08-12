# 🏛️ The Referral Desk

> **An invite-only, enterprise-grade professional referral management platform.**  
> Built with **Vanilla JavaScript (ES6+ SPA)** on the frontend and a lightweight, secure **PHP (PDO) + MySQL** REST backend. Zero Node.js runtime, zero heavy frameworks, zero build tools—deploy anywhere instantly.

---

## 🌟 Executive Overview

**The Referral Desk** is designed to streamline candidate job referrals within companies, alumni networks, and professional communities. It replaces informal and fragmented referral requests (over email or chat apps) with a structured, transparent, and gamified lifecycle.

Members join via admin-generated invite links, post specific referral requests, connect with internal advocates, track referral progress in real time, generate custom thank-you letters, and earn rankings on the community leaderboard.

---

## ✨ Key Features & Capabilities

- 🔒 **Invite-Only Access & Token Management**: Tokenized registration links (`/?invite=CODE`) with multi-use tracking, usage limits, and automatic initial-admin provisioning.
- 📋 **Structured Referral Lifecycle**:
  1. **Ask**: Members post detailed referral requests specifying role, company, team, and context.
  2. **Connect & Refer**: Verified advocates connect to requests and submit referral write-ups.
  3. **Notify**: Real-time notifications update candidate status immediately (`open` ➔ `connected` ➔ `referred` ➔ `thanked`).
  4. **Thank**: Interactive, wax-sealed thank-you note generator sends structured gratitude directly to the referrer.
- 🏆 **Community Leaderboards & Gamification**: Dynamic activity leaderboard ranking members by total referrals made, thank-yous received, and connections established.
- ⚡ **Zero-Dependency SPA Frontend**: Fast single-page application written in pure HTML5, CSS3 (custom CSS variables & animations), and vanilla JavaScript.
- 🛡️ **Enterprise Security**: PHP PDO prepared statements for total SQL injection immunity, Bcrypt password hashing (`password_hash`), secure HTTP-only sessions, and strict Role-Based Access Control (RBAC).

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies | Key Highlights |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JS (ES6+), HTML5, CSS3 | Single-Page Application (SPA), zero bundlers, dynamic DOM rendering, custom CSS tokens & animations. |
| **Backend API** | PHP 8 (PDO) | Modular RESTful JSON API endpoints, parameterized queries, session authentication middleware. |
| **Database** | MySQL (InnoDB) | Relational schema with foreign key constraints, state machine ENUMs, composite indexes on hotpaths. |
| **Deployment** | Apache / Nginx / cPanel | Universal web host compatibility (cPanel, Hostinger, GoDaddy, Namecheap, AWS EC2, DigitalOcean). |

---

## 📁 Project Structure

```
referral-portal/
├── index.html            # Main SPA shell & markup templates
├── database.sql          # MySQL database schema & sample setup
├── DEPLOYMENT.md         # Production hosting deployment guide
├── README.md             # Project documentation
├── css/
│   └── style.css         # UI design system, dark/light theme tokens, wax-seal animations
├── js/
│   ├── api.js            # Modular REST client wrapper (Fetch API)
│   └── app.js            # Frontend router, state manager & component renderer
└── api/
    ├── config.php        # Database PDO singleton & session security middleware
    ├── auth.php          # Sign-in, registration, session verification, logout
    ├── requests.php      # Feed queries, request creation, deletion, and comments
    ├── connections.php   # Referrer-to-request connection handling
    ├── referrals.php     # Referral submission pipeline
    ├── thanks.php        # Formatted thank-you letter generation & delivery
    ├── rankings.php      # Leaderboard aggregation queries
    ├── notifications.php # Real-time notification feed & read status updates
    └── invites.php       # Admin invite token management & member administration
```

---

## 🚀 Quick Setup & Installation

### 1. Database Setup
Import `database.sql` into your MySQL server (via phpMyAdmin or MySQL CLI):
```bash
mysql -u root -p your_database_name < database.sql
```

### 2. Backend Configuration
Update `api/config.php` with your database connection credentials:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');
```

### 3. Run Locally or Deploy
- **Local Server**: You can use PHP's built-in web server for testing:
  ```bash
  php -S localhost:8000
  ```
- **Production Web Host**: Upload all files to your web server (`public_html` directory).

### 4. Admin Initialization
Navigate to `http://localhost:8000` (or your domain) and register the first account—it will automatically be designated as **System Admin**.

---

## 📄 License & Deployment

Detailed step-by-step production hosting guides are available in [DEPLOYMENT.md](DEPLOYMENT.md).
