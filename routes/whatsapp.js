'use strict';

const express = require('express');
const router = express.Router();
const bot = require('../services/whatsappBot');

/**
 * POST /webhook/whatsapp
 * Twilio sends incoming WhatsApp messages here.
 * Configure this URL in Twilio Console → Messaging → WhatsApp Sandbox Settings
 */
router.post('/', async (req, res) => {
  try {
    const from = req.body.From || '';   // e.g. "whatsapp:+27821234567"
    const body = req.body.Body || '';

    if (!from) {
      return res.status(400).send('Missing From field');
    }

    // Strip "whatsapp:" prefix for storage, keep it for sending
    const phone = from.replace(/^whatsapp:/, '');

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
