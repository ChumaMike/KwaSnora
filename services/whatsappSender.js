'use strict';

let twilioClient = null;

function getClient() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token || sid.startsWith('AC') === false) {
      console.warn('⚠️  Twilio not configured — messages will be logged only');
      return null;
    }
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

/**
 * Send a WhatsApp message via Twilio.
 * Falls back to console.log if Twilio is not configured.
 */
async function send(to, body) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!client || !from) {
    console.log(`[WhatsApp → ${to}]: ${body}`);
    return;
  }

  // Ensure numbers are in whatsapp: format
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

  try {
    await client.messages.create({
      from: fromFormatted,
      to: toFormatted,
      body
    });
  } catch (err) {
    console.error(`Failed to send WhatsApp to ${to}:`, err.message);
  }
}

/**
 * Send alert to the admin/business owner's WhatsApp.
 */
async function sendAdmin(body) {
  const adminPhone = process.env.ADMIN_WHATSAPP;
  if (!adminPhone) {
    console.log(`[Admin Alert]: ${body}`);
    return;
  }
  await send(adminPhone, body);
}

module.exports = { send, sendAdmin };
