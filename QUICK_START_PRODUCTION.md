# ⚡ Quick Start - Production Deployment (30 mins)

## 1. Get Your Domain & Server
- Domain: `yourdomain.com` (e.g., from Namecheap, GoDaddy)
- Server: DigitalOcean or Linode ($5-10/month)
- Both should be configured with DNS pointing to server IP

## 2. SSH Into Server
```bash
ssh root@your_server_ip
```

## 3. Run Quick Setup Script
```bash
curl -fsSL https://raw.githubusercontent.com/Darwin2-law/Odds-Havens/main/setup-production.sh | bash
```

Or manual setup:

```bash
# Update & install
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx nodejs npm build-essential sqlite3

# Install Node 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone app
sudo mkdir -p /var/www/oddshaven && cd /var/www/oddshaven
sudo git clone https://github.com/Darwin2-law/Odds-Havens.git .
sudo npm install --production

# Create .env
sudo tee .env > /dev/null << EOF
NODE_ENV=production
PORT=3000
ADMIN_DEFAULT_PASSWORD=ChangeThis123!Strong
VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
EOF

# Generate new VAPID keys:
# Visit: https://web-push-codelab.glitch.me/
# Copy public & private keys into .env

# Get SSL
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Setup nginx (copy config from PRODUCTION_DEPLOYMENT_GUIDE.md)
sudo nano /etc/nginx/sites-available/oddshaven
# Paste nginx config
sudo ln -s /etc/nginx/sites-available/oddshaven /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# Start app
cd /var/www/oddshaven
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Verify
curl -I https://yourdomain.com
```

## 4. Test Everything
```bash
# Check app
https://yourdomain.com

# Check push server
https://push.yourdomain.com

# Verify service worker
https://yourdomain.com/service-worker.js

# Check manifest
https://yourdomain.com/manifest.json
```

## 5. Final Security Steps
```bash
# Change admin password in .env
# Generate new VAPID keys
# Update DATABASE_DIR path
# Enable firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

✅ **Done! Your app is live.** 🎉

For full setup, see `PRODUCTION_DEPLOYMENT_GUIDE.md`
