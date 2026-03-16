'use strict';

const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const bot = require('../services/whatsappBot');

// Validate that requests come from Twilio (production only — skip if no auth token configured)
function twilioWebhookGuard(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || process.env.NODE_ENV !== 'production') return next();

  const signature = req.headers['x-twilio-signature'] || '';
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!valid) return res.status(403).send('Forbidden');
  next();
}

/**
 * POST /webhook/whatsapp
 * Twilio sends incoming WhatsApp messages here.
 * Configure this URL in Twilio Console → Messaging → WhatsApp Sandbox Settings
 */
router.post('/', twilioWebhookGuard, async (req, res) => {
  try {
    const from = req.body.From || '';   // e.g. "whatsapp:+27821234567"
    const body = req.body.Body || '';

    if (!from) {
      return res.status(400).send('Missing From field');
    }

    // Strip "whatsapp:" prefix for storage; trim and restore + prefix if dropped by URL encoding
    let phone = from.replace(/^whatsapp:/i, '').trim();
    // URL form-encoding decodes '+' as space — restore it
    if (phone.startsWith(' ')) phone = '+' + phone.slice(1);

    // Process message asynchronously — respond to Twilio quickly
    bot.handleMessage(phone, body).catch(err => {
      console.error('Bot error:', err);
    });

    // Twilio expects an empty TwiML response or a <Response/> — we send messages via API so empty is fine
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('<Response></Response>');
  }
});

module.exports = router;
