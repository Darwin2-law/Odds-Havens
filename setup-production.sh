#!/bin/bash

# OddsHaven Production Setup Script
# Run as root on Ubuntu 22.04
# Usage: bash setup-production.sh yourdomain.com

set -e

if [ -z "$1" ]; then
  echo "Usage: bash setup-production.sh yourdomain.com"
  exit 1
fi

DOMAIN=$1
APP_DIR="/var/www/oddshaven"
VAR_LIB="/var/lib/oddshaven"

echo "🚀 OddsHaven Production Setup"
echo "Domain: $DOMAIN"
echo ""

# Update system
echo "📦 Updating system..."
sudo apt update && sudo apt upgrade -y

# Install dependencies
echo "📦 Installing dependencies..."
sudo apt install -y \
  curl wget git nano nginx certbot python3-certbot-nginx \
  build-essential sqlite3 mailutils

# Install Node.js 18
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Clone repository
echo "📦 Cloning OddsHaven..."
sudo mkdir -p $APP_DIR
sudo git clone https://github.com/Darwin2-law/Odds-Havens.git $APP_DIR
cd $APP_DIR

# Install dependencies
echo "📦 Installing Node dependencies..."
sudo npm install --production

# Create directories
echo "📁 Creating directories..."
sudo mkdir -p $VAR_LIB /var/log/oddshaven
sudo chown -R www-data:www-data $APP_DIR $VAR_LIB /var/log/oddshaven

# Create .env file
echo "📝 Creating .env file..."
sudo tee $APP_DIR/.env > /dev/null << EOF
NODE_ENV=production
PORT=3000
DB_PATH=$VAR_LIB/database.sqlite
ADMIN_DEFAULT_PASSWORD=ChangeThis123!Strong
SESSION_SECRET=$(openssl rand -base64 32)
VAPID_SUBJECT=mailto:support@$DOMAIN
VAPID_PUBLIC_KEY=REPLACE_WITH_YOUR_PUBLIC_KEY
VAPID_PRIVATE_KEY=REPLACE_WITH_YOUR_PRIVATE_KEY
PUSH_SERVER_PORT=3001
PUSH_SERVER_URL=https://push.$DOMAIN
EOF

echo "⚠️  Edit .env with your VAPID keys:"
echo "   Visit: https://web-push-codelab.glitch.me/"
echo "   File: $APP_DIR/.env"
echo ""

# Get SSL certificate
echo "🔒 Getting SSL certificate..."
sudo systemctl stop nginx
sudo certbot certonly --standalone \
  -d $DOMAIN -d www.$DOMAIN \
  --email support@$DOMAIN \
  --agree-tos --non-interactive
sudo certbot certonly --standalone \
  -d push.$DOMAIN \
  --email support@$DOMAIN \
  --agree-tos --non-interactive || true

# Configure nginx
echo "🌐 Configuring nginx..."
sudo tee /etc/nginx/sites-available/oddshaven > /dev/null << 'NGINX_CONFIG'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name DOMAIN www.DOMAIN;

    ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location ~* \.(js|css|png|jpg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

server {
    listen 443 ssl http2;
    server_name push.DOMAIN;

    ssl_certificate /etc/letsencrypt/live/push.DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/push.DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX_CONFIG

# Replace domain in nginx config
sudo sed -i "s/DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/oddshaven

# Enable nginx
sudo ln -sf /etc/nginx/sites-available/oddshaven /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

# Create PM2 config
echo "⚙️  Creating PM2 configuration..."
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable -y

echo ""
echo "✅ Setup Complete!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit .env with VAPID keys:"
echo "   nano $APP_DIR/.env"
echo "2. Visit: https://web-push-codelab.glitch.me/"
echo "3. Change admin password in .env"
echo "4. Restart app: pm2 restart all"
echo ""
echo "🚀 Your app is now running at:"
echo "   https://$DOMAIN"
echo "   https://push.$DOMAIN"
echo ""
echo "📝 Logs: pm2 logs"
echo "🔄 Restart: pm2 restart all"
echo "⚙️  Status: pm2 status"
