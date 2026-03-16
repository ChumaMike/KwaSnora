'use strict';

const db = require('../db/database');
const { sendAdmin } = require('../services/whatsappSender');

const THRESHOLD = parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10);

/**
 * Check all products for low stock and alert admin if needed.
 * Avoids duplicate alerts for already-notified low-stock items.
 */
async function checkAll() {
  try {
    const lowStock = db.prepare(`
      SELECT id, name, stock FROM products
      WHERE stock <= ? AND available = 1
    `).all(THRESHOLD);

    for (const product of lowStock) {
      // Check if an unresolved alert already exists for this product at this level
      const existing = db.prepare(`
        SELECT id FROM stock_alerts
        WHERE product_id = ? AND resolved = 0
      `).get(product.id);

      if (!existing) {
        db.prepare(`
          INSERT INTO stock_alerts (product_id, stock_level) VALUES (?, ?)
        `).run(product.id, product.stock);

        const businessName = process.env.BUSINESS_NAME || 'KwaSnora';
        const msg = `⚠️ *${businessName} Stock Alert*\n\n*${product.name}* is running low!\nOnly *${product.stock}* left in stock.\n\nPlease restock soon.`;
        await sendAdmin(msg);
        console.log(`Stock alert sent for: ${product.name} (${product.stock} remaining)`);
      }
    }

    // Auto-resolve alerts for products that now have stock above threshold
    const resolved = db.prepare(`
      SELECT sa.id, sa.product_id FROM stock_alerts sa
      JOIN products p ON p.id = sa.product_id
      WHERE sa.resolved = 0 AND p.stock > ?
    `).all(THRESHOLD);

    for (const alert of resolved) {
      db.prepare('UPDATE stock_alerts SET resolved = 1 WHERE id = ?').run(alert.id);
    }
  } catch (err) {
    console.error('StockAgent error:', err.message);
  }
}

module.exports = { checkAll };
