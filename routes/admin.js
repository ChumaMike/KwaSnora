'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const adminAuth = require('../middleware/adminAuth');
const statusAgent = require('../agents/statusAgent');
const stockAgent = require('../agents/stockAgent');
const aiChat = require('../services/aiChat');

// Apply auth middleware to ALL admin routes
router.use(adminAuth);

// ── Dashboard ────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

router.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const stats = {
      totalOrders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
      todayOrders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(today).c,
      pendingOrders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','confirmed','preparing')").get().c,
      totalRevenue: db.prepare("SELECT COALESCE(SUM(total),0) as r FROM orders WHERE status != 'cancelled'").get().r,
      todayRevenue: db.prepare("SELECT COALESCE(SUM(total),0) as r FROM orders WHERE date(created_at) = ? AND status != 'cancelled'").get(today).r,
      productCount: db.prepare('SELECT COUNT(*) as c FROM products WHERE available = 1').get().c,
    };

    const recentOrders = db.prepare(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC LIMIT 10
    `).all();

    const lowStockAlerts = db.prepare(`
      SELECT p.name, p.stock, sa.notified_at
      FROM stock_alerts sa JOIN products p ON p.id = sa.product_id
      WHERE sa.resolved = 0
      ORDER BY sa.notified_at DESC
    `).all();

    res.render('admin/dashboard', {
      title: 'Dashboard',
      stats,
      recentOrders,
      lowStockAlerts,
      businessName: process.env.BUSINESS_NAME || 'KwaSnora'
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

// ── Orders ────────────────────────────────────────────────────────────────────

router.get('/orders', (req, res) => {
  try {
    const status = req.query.status || '';
    let query = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    `;
    const params = [];
    if (status) {
      query += ' WHERE o.status = ?';
      params.push(status);
    }
    query += ' ORDER BY o.created_at DESC';

    const orders = db.prepare(query).all(...params);
    const parsedOrders = orders.map(o => {
      try { o.items = JSON.parse(o.items_json || '[]'); } catch { o.items = []; }
      return o;
    });

    res.render('admin/orders', {
      title: 'Orders',
      orders: parsedOrders,
      statusFilter: status,
      businessName: process.env.BUSINESS_NAME || 'KwaSnora'
    });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
    await statusAgent.notifyCustomer(parseInt(id, 10), status);
    res.json({ success: true });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    await statusAgent.notifyCustomer(parseInt(id, 10), 'cancelled');
    res.redirect('/admin/orders');
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

// ── Products ──────────────────────────────────────────────────────────────────

router.get('/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
    const threshold = parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10);
    res.render('admin/products', {
      title: 'Products',
      products,
      threshold,
      businessName: process.env.BUSINESS_NAME || 'KwaSnora'
    });
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const { name, description, price, category, stock, available } = req.body;
    if (!name || !price) return res.status(400).redirect('/admin/products');
    db.prepare(`
      INSERT INTO products (name, description, price, category, stock, available)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      (description || '').trim(),
      parseFloat(price),
      (category || 'General').trim(),
      parseInt(stock || '0', 10),
      available === 'on' || available === '1' ? 1 : 1
    );
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, stock, available } = req.body;
    db.prepare(`
      UPDATE products SET name=?, description=?, price=?, category=?, stock=?, available=?
      WHERE id=?
    `).run(
      name.trim(),
      (description || '').trim(),
      parseFloat(price),
      (category || 'General').trim(),
      parseInt(stock || '0', 10),
      available === 'on' || available === '1' ? 1 : 0,
      id
    );
    // Re-check stock after manual update
    await stockAgent.checkAll();
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/products/:id/delete', (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/products/:id/toggle', (req, res) => {
  try {
    db.prepare('UPDATE products SET available = 1 - available WHERE id = ?').run(req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Toggle product error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

// ── AI Chat ───────────────────────────────────────────────────────────────────

router.get('/ai-chat', (req, res) => {
  try {
    const history = aiChat.getHistory(50);
    res.render('admin/ai-chat', {
      title: 'AI Assistant',
      history,
      businessName: process.env.BUSINESS_NAME || 'KwaSnora'
    });
  } catch (err) {
    console.error('AI chat load error:', err);
    res.status(500).render('error', { message: err.message });
  }
});

router.post('/ai-chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const reply = await aiChat.chat(message.trim());
    res.json({ reply });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ai-chat/clear', (req, res) => {
  try {
    aiChat.clearHistory();
    res.redirect('/admin/ai-chat');
  } catch (err) {
    res.status(500).render('error', { message: err.message });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin');
  });
});

module.exports = router;
