'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust reverse proxy (Railway, Nginx, etc.) so secure cookies work behind HTTPS
app.set('trust proxy', 1);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'kwasnora-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));

// ── Initialize database (runs schema + seed on first start) ──────────────────
require('./db/database');

// ── Routes ────────────────────────────────────────────────────────────────────
const adminRouter = require('./routes/admin');
const whatsappRouter = require('./routes/whatsapp');

app.use('/admin', adminRouter);
app.use('/webhook/whatsapp', whatsappRouter);

// Home page — redirect to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  if (req.path.startsWith('/admin')) {
    return res.status(status).render('error', {
      message: process.env.NODE_ENV === 'production' ? 'An error occurred. Please try again.' : err.message
    });
  }
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.status(404).render('error', { message: 'Page not found' });
  }
  res.status(404).json({ error: 'Not found' });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const biz = process.env.BUSINESS_NAME || 'KwaSnora';
  console.log(`\n🚀 ${biz} server running on http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin?pass=${process.env.ADMIN_PASSWORD || 'admin123'}`);
  console.log(`📱 WhatsApp webhook: POST http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`\nConfigure your Twilio WhatsApp webhook URL to: https://YOUR_DOMAIN/webhook/whatsapp\n`);
});

module.exports = app;
