'use strict';

const db = require('../db/database');
const { sendAdmin } = require('../services/whatsappSender');
const stockAgent = require('./stockAgent');

/**
 * Process a confirmed order from the WhatsApp bot.
 * @param {string} phone - Customer's WhatsApp phone number
 * @param {string} customerName - Customer's name
 * @param {Array} cart - Array of { product_id, name, qty, price }
 * @returns {object} Created order
 */
async function processOrder(phone, customerName, cart) {
  // Upsert customer
  let customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
  if (!customer) {
    const result = db.prepare(
      'INSERT INTO customers (phone, name) VALUES (?, ?)'
    ).run(phone, customerName || 'Customer');
    customer = { id: result.lastInsertRowid };
  } else if (customerName) {
    db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(customerName, customer.id);
  }

  // Calculate total
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Create order
  const orderResult = db.prepare(`
    INSERT INTO orders (customer_id, items_json, total, status)
    VALUES (?, ?, ?, 'pending')
  `).run(customer.id, JSON.stringify(cart), total);

  const orderId = orderResult.lastInsertRowid;

  // Deduct stock for each item
  const deductStock = db.transaction(() => {
    for (const item of cart) {
      db.prepare(`
        UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?
      `).run(item.qty, item.product_id);
    }
  });
  deductStock();

  // Notify admin
  const businessName = process.env.BUSINESS_NAME || 'KwaSnora';
  const itemsSummary = cart.map(i => `  • ${i.name} x${i.qty}`).join('\n');
  const adminMsg = `🛒 *New Order #${orderId}* — ${businessName}\n\nFrom: ${customerName || phone}\nPhone: ${phone}\n\nItems:\n${itemsSummary}\n\n*Total: R${total.toFixed(2)}*`;

  await sendAdmin(adminMsg);

  // Check stock levels after deduction
  await stockAgent.checkAll();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  return order;
}

module.exports = { processOrder };
