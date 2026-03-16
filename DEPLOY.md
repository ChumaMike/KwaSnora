# Deployment Guide

## Before you deploy — checklist

1. **Change `ADMIN_PASSWORD`** — never go live with `admin123`
2. **Generate a real `SESSION_SECRET`**:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Add real Twilio credentials** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`)
4. **Set `NODE_ENV=production`** — enables HTTPS-only cookies and Twilio signature validation
5. **Add your WhatsApp number** as `ADMIN_WHATSAPP` to receive order and stock alerts

---

## Option A — Railway (Easiest, free tier, auto HTTPS)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all environment variables from `.env.example` in Railway's Variables tab
4. Railway gives you a public HTTPS URL automatically — use it as your Twilio webhook URL
5. Set `NODE_ENV=production` in Railway variables

**Twilio webhook URL:** `https://your-app.up.railway.app/webhook/whatsapp`

**SQLite note:** Railway has ephemeral storage — your database resets on redeploy. To persist it, add a Railway Volume and set `DATABASE_PATH=/data/kwasnora.db`.

---

## Option B — VPS (Ubuntu + Nginx + PM2)

### 1. Install Node.js and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Deploy the app

```bash
git clone https://github.com/YOUR_USERNAME/KwaSnora.git /var/www/kwasnora
cd /var/www/kwasnora
npm install --production
cp .env.example .env
# Edit .env with your real values
nano .env
```

### 3. Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### 4. Set up Nginx

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. Add HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot auto-renews. Your app will now have HTTPS.

**Twilio webhook URL:** `https://yourdomain.com/webhook/whatsapp`

---

## PM2 commands

```bash
pm2 status                        # see if app is running
pm2 logs kwasnora                 # view live logs
pm2 restart kwasnora              # restart after code changes
pm2 stop kwasnora                 # stop the app
```

---

## Twilio webhook setup

1. Log in to [console.twilio.com](https://console.twilio.com)
2. Go to Messaging → Try it out → Send a WhatsApp message (Sandbox)
3. Under "When a message comes in", enter your webhook URL:
   `https://YOUR_DOMAIN/webhook/whatsapp`
4. Method: **HTTP POST**
5. Save

Once you're off the sandbox (Twilio WhatsApp approval), update the same URL in your approved sender settings.
