# 📱 KwaSnora — WhatsApp Ordering

A low-data WhatsApp ordering app for local restaurants and takeaways. Customers browse, order, and pay over WhatsApp — no app install, no data-heavy storefront. Twilio handles messaging, Gemini handles natural-language understanding.

---

## Why

Most township takeaways take orders on WhatsApp already — informally, in free text. KwaSnora formalises that flow without forcing customers to learn a new app. They send a casual message ("2 kotas with everything"), the bot confirms structured details, the kitchen gets a printed ticket.

---

## Stack

| Layer | Tech |
| :--- | :--- |
| Runtime | Node.js · Express |
| Messaging | Twilio WhatsApp API |
| AI | Google Gemini (intent + extraction) |
| DB | SQLite via `better-sqlite3` |
| Views | EJS |
| Security | Helmet · rate-limiting · bcrypt · session auth |
| Process | PM2 via `ecosystem.config.js` |

---

## Quick start

```bash
git clone https://github.com/ChumaMike/KwaSnora.git
cd KwaSnora
npm install
cp .env.example .env
# Set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, GOOGLE_API_KEY, SESSION_SECRET
npm start
```

Point your Twilio WhatsApp sandbox webhook at `https://<your-host>/whatsapp`.

See [`DEPLOY.md`](DEPLOY.md) for production deployment notes.

---

## 🗺️ Roadmap

- [ ] Yoco payment link generation
- [ ] Multi-merchant mode (currently single-tenant)
- [ ] Voice-note orders via Whisper
- [ ] Printer integration for kitchen tickets

---

## License

MIT · Built by [Chuma Meyiswa](https://github.com/ChumaMike)
