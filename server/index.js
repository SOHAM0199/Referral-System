require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const requestRoutes = require('./routes/requests');
const connectionRoutes = require('./routes/connections');
const referralRoutes = require('./routes/referrals');
const thanksRoutes = require('./routes/thanks');
const rankingRoutes = require('./routes/rankings');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/requests', connectionRoutes);   // adds POST /api/requests/:requestId/connect
app.use('/api/connections', referralRoutes);  // adds POST /api/connections/:connectionId/refer
app.use('/api/referrals', thanksRoutes);      // adds POST /api/referrals/:referralId/thank
app.use('/api/rankings', rankingRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback: any unknown non-API route serves the app shell (client-side routing)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error handler — keeps error shape consistent for the frontend
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong on our end.' });
});

app.listen(PORT, () => {
  console.log(`Referral portal running on http://localhost:${PORT}`);
});
