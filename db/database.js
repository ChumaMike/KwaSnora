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
    // Kotas
    insert.run('Basic Kota', 'Quarter loaf of bread filled with chips (fries), a slice of polony and achaar', 15.00, 'Kotas', 50);
    insert.run('Kota with Cheese', 'Fried chips, achaar, polony, cheese', 12.00, 'Kotas', 50);
    insert.run('Kota Special', 'Fried chips, achaar, polony, cheese, special', 20.00, 'Kotas', 50);
    insert.run('Kota Vienna', 'Fried chips, achaar, polony, cheese, vienna', 22.00, 'Kotas', 50);
    insert.run('Kota Russian', 'Fried chips, achaar, polony, cheese, russian', 24.00, 'Kotas', 50);
    insert.run('Kota with Egg', 'Fried chips, achaar, polony, egg, cheese', 26.00, 'Kotas', 50);
    insert.run('Kota Burger', 'Fried chips, achaar, polony, cheese, burger', 28.00, 'Kotas', 50);
    insert.run('Kota Special Vienna Burger', 'Fried chips, achaar, polony, cheese, special, vienna, burger', 30.00, 'Kotas', 50);
    insert.run('Kota Special Russian', 'Fried chips, achaar, polony, cheese, special, russian', 32.00, 'Kotas', 50);
    insert.run('Mega Kota', 'Fried chips, achaar, polony, cheese, special, burger, vienna, russian — the works!', 35.00, 'Kotas', 50);
    // Popcorn
    insert.run('Small Popcorn', 'Salted or cheese flavour', 5.00, 'Popcorn', 50);
    insert.run('Medium Popcorn', 'Salted or cheese flavour', 10.00, 'Popcorn', 50);
    insert.run('Large Popcorn', 'Salted or cheese flavour', 15.00, 'Popcorn', 50);
    // Ice Cream
    insert.run('Ice Cream Cone', 'Single scoop on a cone — vanilla, chocolate or strawberry', 5.00, 'Ice Cream', 50);
    insert.run('Ice Cream Cup', 'Single scoop in a cup — vanilla, chocolate or strawberry', 8.00, 'Ice Cream', 50);
    // Combos
    insert.run('Vietkoek Combo', 'Vietkoek, fried chips, slice of French polony', 0.00, 'Combos', 50);
    insert.run('The Good', 'Sliced loaf of bread with cheese, burger patty, lettuce, sliced tomato, onion & sauces', 0.00, 'Combos', 50);
  });

  seedProducts();
  console.log('✅ Database seeded with sample products');
}

module.exports = db;
