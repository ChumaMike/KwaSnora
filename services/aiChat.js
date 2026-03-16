'use strict';

const db = require('../db/database');

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'your_gemini_api_key_here') {
      return null;
    }
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

function getLiveStats() {
  const today = new Date().toISOString().split('T')[0];

  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(today).c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','confirmed','preparing')").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as r FROM orders WHERE status != 'cancelled'").get().r;
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as r FROM orders WHERE date(created_at) = ? AND status != 'cancelled'").get(today).r;
  const productCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE available = 1').get().c;
  const lowStockCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE stock <= ? AND available = 1`).get(parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10)).c;

  const recentOrders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at, c.name, c.phone
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC LIMIT 5
  `).all();

  const lowStockItems = db.prepare(`
    SELECT name, stock FROM products WHERE stock <= ? AND available = 1
  `).all(parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10));

  return {
    totalOrders, todayOrders, pendingOrders,
    totalRevenue, todayRevenue,
    productCount, lowStockCount,
    recentOrders, lowStockItems
  };
}

function buildSystemPrompt(stats) {
  const biz = process.env.BUSINESS_NAME || 'KwaSnora';
  const recentOrdersText = stats.recentOrders.map(o =>
    `  Order #${o.id}: R${Number(o.total).toFixed(2)} (${o.status}) - ${o.name || o.phone}`
  ).join('\n');
  const lowStockText = stats.lowStockItems.length > 0
    ? stats.lowStockItems.map(p => `  • ${p.name}: ${p.stock} left`).join('\n')
    : '  None currently';

  return `You are the AI business assistant for *${biz}*, a food ordering business using WhatsApp.

You help the business owner track their operations, understand performance, and make informed decisions.

## Live Business Stats (as of now)
- Total Orders: ${stats.totalOrders}
- Orders Today: ${stats.todayOrders}
- Pending/Active Orders: ${stats.pendingOrders}
- Total Revenue: R${Number(stats.totalRevenue).toFixed(2)}
- Revenue Today: R${Number(stats.todayRevenue).toFixed(2)}
- Active Menu Items: ${stats.productCount}
- Low Stock Items: ${stats.lowStockCount}

## Recent Orders
${recentOrdersText || '  No orders yet'}

## Low Stock Items
${lowStockText}

Be helpful, concise, and business-focused. You can suggest actions the owner should take based on the data.
When asked about specific metrics, always reference the live data above.`;
}

/**
 * Send a message to Gemini and get a response.
 * Stores conversation history in ai_chats table.
 * @param {string} userMessage
 * @returns {Promise<string>} Assistant reply
 */
async function chat(userMessage) {
  // Save user message
  db.prepare('INSERT INTO ai_chats (role, content) VALUES (?, ?)').run('user', userMessage);

  const ai = getGenAI();
  if (!ai) {
    const fallback = '⚠️ AI chat is not configured. Please add your GEMINI_API_KEY to the .env file. Get a free key at https://aistudio.google.com';
    db.prepare('INSERT INTO ai_chats (role, content) VALUES (?, ?)').run('model', fallback);
    return fallback;
  }

  try {
    const stats = getLiveStats();
    const systemInstruction = buildSystemPrompt(stats);

    // Load conversation history (last 20 messages, excluding the one just saved)
    const history = db.prepare(`
      SELECT role, content FROM ai_chats
      ORDER BY created_at DESC LIMIT 21
    `).all().reverse().slice(0, -1); // exclude last (the one we just added)

    // Format history for Gemini (role: 'user'|'model')
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction
    });

    const chatSession = model.startChat({ history: formattedHistory });
    const result = await chatSession.sendMessage(userMessage);
    const reply = result.response.text();

    db.prepare('INSERT INTO ai_chats (role, content) VALUES (?, ?)').run('model', reply);
    return reply;
  } catch (err) {
    console.error('Gemini API error:', err.message);
    const errorMsg = `Sorry, I encountered an error: ${err.message}. Please try again.`;
    db.prepare('INSERT INTO ai_chats (role, content) VALUES (?, ?)').run('model', errorMsg);
    return errorMsg;
  }
}

/**
 * Get recent chat history for display.
 */
function getHistory(limit = 50) {
  return db.prepare(`
    SELECT role, content, created_at FROM ai_chats
    ORDER BY created_at ASC LIMIT ?
  `).all(limit);
}

/**
 * Clear chat history.
 */
function clearHistory() {
  db.prepare('DELETE FROM ai_chats').run();
}

module.exports = { chat, getHistory, clearHistory };
