'use strict';

const db = require('../db/database');
const { send } = require('../services/whatsappSender');

const STATUS_MESSAGES = {
  confirmed: '✅ Your order has been *confirmed*! We\'ll start preparing it shortly.',
  preparing: '👨‍🍳 Your order is now being *prepared*! It won\'t be long.',
  ready: '🎉 Your order is *ready*! You can collect it now or it\'s on its way.',
  delivered: '✅ Your order has been *delivered*. Thank you for ordering from us! 😊',
  cancelled: '❌ Your order has been *cancelled*. Please contact us if this was a mistake.'
};

/**
 * Notify customer of order status change via WhatsApp.
 * @param {number} orderId
 * @param {string} newStatus
 */
async function notifyCustomer(orderId, newStatus) {
  try {
    const row = db.prepare(`
      SELECT o.id, o.total, c.phone, c.name
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ?
    `).get(orderId);

    if (!row || !row.phone) return;

    const messageTemplate = STATUS_MESSAGES[newStatus];
    if (!messageTemplate) return;

    const businessName = process.env.BUSINESS_NAME || 'KwaSnora';
    const msg = `*${businessName}* — Order #${orderId}\n\n${messageTemplate}\n\nTotal: R${Number(row.total).toFixed(2)}`;

    await send(row.phone, msg);
  } catch (err) {
    console.error('StatusAgent error:', err.message);
  }
}

module.exports = { notifyCustomer };
