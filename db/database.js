'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || './data/kwasnora.db';

// Ensure data directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    category TEXT DEFAULT 'General',
    stock INTEGER DEFAULT 0,
    available INTEGER DEFAULT 1,
    image_url TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT 'Customer',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    items_json TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    state TEXT DEFAULT 'INIT',
    cart_json TEXT DEFAULT '[]',
    selected_category TEXT DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    stock_level INTEGER,
    notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER DEFAULT 0
  );
`);

// Seed sample products if empty
const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, description, price, category, stock, available)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const seedProducts = db.transaction(() => {
    insert.run('Beef Burger', 'Juicy beef patty with lettuce, tomato & cheese', 85.00, 'Burgers', 20);
    insert.run('Chicken Burger', 'Crispy fried chicken with coleslaw & mayo', 75.00, 'Burgers', 20);
    insert.run('Veggie Wrap', 'Fresh vegetables, hummus & feta in a whole wheat wrap', 65.00, 'Wraps', 15);
    insert.run('Chicken Wings (6pc)', 'Spicy buffalo wings with blue cheese dip', 70.00, 'Sides', 25);
    insert.run('Loaded Fries', 'Crispy fries topped with cheese sauce & jalapeños', 45.00, 'Sides', 30);
    insert.run('Chocolate Milkshake', 'Thick creamy chocolate milkshake', 40.00, 'Drinks', 50);
    insert.run('Fresh Lemonade', 'Freshly squeezed lemonade with mint', 30.00, 'Drinks', 50);
    insert.run('Cheese Pizza (Small)', '4-slice personal pizza with mozzarella & tomato', 95.00, 'Pizza', 10);
  });

  seedProducts();
  console.log('✅ Database seeded with sample products');
}

module.exports = db;
