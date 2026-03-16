'use strict';

const db = require('../db/database');
const { send } = require('./whatsappSender');
const orderAgent = require('../agents/orderAgent');

const businessName = () => process.env.BUSINESS_NAME || 'KwaSnora';

// ── Session helpers ─────────────────────────────────────────────────────────

function getSession(phone) {
  let session = db.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').get(phone);
  if (!session) {
    db.prepare('INSERT INTO whatsapp_sessions (phone) VALUES (?)').run(phone);
    session = db.prepare('SELECT * FROM whatsapp_sessions WHERE phone = ?').get(phone);
  }
  return session;
}

function updateSession(phone, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), phone];
  db.prepare(`UPDATE whatsapp_sessions SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE phone = ?`).run(...values);
}

function getCart(session) {
  try { return JSON.parse(session.cart_json || '[]'); } catch { return []; }
}

// ── Menu helpers ─────────────────────────────────────────────────────────────

function getCategories() {
  return db.prepare(`
    SELECT DISTINCT category FROM products WHERE available = 1 ORDER BY category
  `).all().map(r => r.category);
}

function getProductsByCategory(category) {
  return db.prepare(`
    SELECT * FROM products WHERE available = 1 AND category = ? ORDER BY price
  `).all(category);
}

function formatMenu() {
  const categories = getCategories();
  if (categories.length === 0) return 'Sorry, no items available right now.';
  let msg = `🍽️ *${businessName()} Menu*\n\nChoose a category:\n\n`;
  categories.forEach((cat, i) => {
    msg += `*${i + 1}.* ${cat}\n`;
  });
  msg += '\nReply with the number to browse items.';
  return msg;
}

function formatCategoryItems(products) {
  let msg = `*${products[0]?.category || 'Items'}*\n\n`;
  products.forEach((p, i) => {
    msg += `*${i + 1}.* ${p.name} — R${Number(p.price).toFixed(2)}\n`;
    if (p.description) msg += `   _${p.description}_\n`;
  });
  msg += '\nReply with item number to add to cart, or *menu* to go back, or *cart* to view your cart.';
  return msg;
}

function formatCart(cart) {
  if (cart.length === 0) return 'Your cart is empty.';
  let msg = '🛒 *Your Cart:*\n\n';
  cart.forEach(item => {
    msg += `• ${item.name} x${item.qty} — R${(item.price * item.qty).toFixed(2)}\n`;
  });
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  msg += `\n*Total: R${total.toFixed(2)}*`;
  return msg;
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleMessage(phone, messageBody) {
  const raw = (messageBody || '').trim();
  const input = raw.toLowerCase();
  const session = getSession(phone);
  const cart = getCart(session);

  // Global commands (always available)
  if (['hi', 'hello', 'hey', 'start', 'hola'].includes(input)) {
    updateSession(phone, { state: 'MENU', cart_json: '[]', selected_category: '' });
    const welcome = `👋 Welcome to *${businessName()}*!\n\nWe're glad you're here. Here's what we have today:\n\n${formatMenu()}`;
    await send(phone, welcome);
    return;
  }

  if (input === 'menu') {
    updateSession(phone, { state: 'MENU', selected_category: '' });
    await send(phone, formatMenu());
    return;
  }

  if (input === 'cart') {
    const cartMsg = formatCart(cart);
    const options = cart.length > 0
      ? '\n\nType *checkout* to confirm, *menu* to keep browsing, or *cancel* to clear cart.'
      : '\n\nType *menu* to browse our menu.';
    await send(phone, cartMsg + options);
    return;
  }

  if (input === 'cancel') {
    updateSession(phone, { state: 'INIT', cart_json: '[]', selected_category: '' });
    await send(phone, '❌ Your cart has been cleared. Type *hi* to start again or *menu* to browse.');
    return;
  }

  if (input === 'checkout' || input === 'done') {
    if (cart.length === 0) {
      await send(phone, 'Your cart is empty! Type *menu* to add items.');
      return;
    }
    updateSession(phone, { state: 'CONFIRMING' });
    const cartSummary = formatCart(cart);
    await send(phone, `${cartSummary}\n\nType *yes* to place this order or *no* to go back.`);
    return;
  }

  // State: MENU — customer picking a category
  if (session.state === 'MENU') {
    const categories = getCategories();
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= categories.length) {
      const category = categories[num - 1];
      const products = getProductsByCategory(category);
      updateSession(phone, { state: 'BROWSING', selected_category: category });
      await send(phone, formatCategoryItems(products));
      return;
    }
    await send(phone, `Please reply with a number 1-${categories.length}.\n\n${formatMenu()}`);
    return;
  }

  // State: BROWSING — customer picking an item
  if (session.state === 'BROWSING') {
    const products = getProductsByCategory(session.selected_category || '');
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= products.length) {
      const product = products[num - 1];
      // Add to cart (increment qty if already in cart)
      const existing = cart.find(i => i.product_id === product.id);
      if (existing) {
        existing.qty += 1;
      } else {
        cart.push({ product_id: product.id, name: product.name, qty: 1, price: product.price });
      }
      updateSession(phone, { cart_json: JSON.stringify(cart) });
      const cartMsg = formatCart(cart);
      await send(phone, `✅ Added *${product.name}*!\n\n${cartMsg}\n\nType another number to add more, *checkout* to order, or *menu* for categories.`);
      return;
    }
    await send(phone, `Please reply with a number 1-${products.length}.\n\n${formatCategoryItems(products)}`);
    return;
  }

  // State: CONFIRMING — awaiting yes/no
  if (session.state === 'CONFIRMING') {
    if (input === 'yes' || input === 'y') {
      if (cart.length === 0) {
        updateSession(phone, { state: 'INIT', cart_json: '[]' });
        await send(phone, 'Your cart is empty. Type *menu* to start ordering.');
        return;
      }
      try {
        const customer = db.prepare('SELECT name FROM customers WHERE phone = ?').get(phone);
        const order = await orderAgent.processOrder(phone, customer?.name || '', cart);
        updateSession(phone, { state: 'INIT', cart_json: '[]', selected_category: '' });
        const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
        await send(phone,
          `🎉 *Order #${order.id} confirmed!*\n\nTotal: R${total.toFixed(2)}\n\nWe'll notify you when your order is ready. Thank you for ordering from *${businessName()}*! 🙏`
        );
      } catch (err) {
        console.error('Order processing error:', err);
        await send(phone, 'Sorry, there was an error placing your order. Please try again.');
      }
      return;
    }

    if (input === 'no' || input === 'n') {
      updateSession(phone, { state: 'BROWSING' });
      const products = getProductsByCategory(session.selected_category || '');
      if (products.length > 0) {
        await send(phone, `No problem! ${formatCategoryItems(products)}`);
      } else {
        updateSession(phone, { state: 'MENU' });
        await send(phone, `No problem! ${formatMenu()}`);
      }
      return;
    }

    const cartMsg = formatCart(cart);
    await send(phone, `${cartMsg}\n\nType *yes* to confirm or *no* to go back.`);
    return;
  }

  // Default / INIT state
  updateSession(phone, { state: 'MENU' });
  await send(phone, `👋 Welcome to *${businessName()}*!\n\n${formatMenu()}`);
}

module.exports = { handleMessage };
