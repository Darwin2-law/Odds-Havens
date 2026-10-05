# 🚀 OddsHaven Production Deployment Guide

## Prerequisites
- Domain name (e.g., `yourdomain.com`)
- SSL Certificate (Let's Encrypt - FREE)
- VPS/Server (DigitalOcean, AWS, Linode, etc.)
- Git installed
- Node.js 18+

---

## Step-by-Step Deployment

### 1. Server Setup (Ubuntu 22.04)

```bash
# Login to your server
ssh root@your_server_ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
  curl \
  wget \
  git \
  nano \
  nginx \
  python3-certbot-nginx \
  build-essential \
  sqlite3

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Verify installations
node --version
npm --version
pm2 --version
```

### 2. Create Application User

```bash
# Create non-root user
sudo useradd -m -d /home/oddshaven -s /bin/bash oddshaven

# Add to sudoers
sudo usermod -aG sudo oddshaven

# Switch to new user
su - oddshaven
```

### 3. Clone Repository

```bash
# Create app directory
sudo mkdir -p /var/www/oddshaven
sudo chown oddshaven:oddshaven /var/www/oddshaven

# Clone repository
cd /var/www/oddshaven
git clone https://github.com/Darwin2-law/Odds-Havens.git .

# Install dependencies (production only)
npm install --production
```

### 4. Environment Configuration

```bash
# Create .env file
nano /var/www/oddshaven/.env
```

Paste this configuration:

```env
# Environment
NODE_ENV=production
PORT=3000

# Database
DB_PATH=/var/lib/oddshaven/database.sqlite

# Session
SESSION_SECRET=your-very-secure-random-secret-here-change-this
SESSION_MAX_AGE=2592000000

# Admin
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=change-this-to-strong-password

# VAPID Keys (Generate new ones!)
# Visit: https://web-push-codelab.glitch.me/
VAPID_SUBJECT=mailto:support@yourdomain.com
VAPID_PUBLIC_KEY=your-production-public-key-here
VAPID_PRIVATE_KEY=your-production-private-key-here

# Push Server
PUSH_SERVER_PORT=3001
PUSH_SERVER_URL=https://push.yourdomain.com

# Database Storage
DATABASE_DIR=/var/lib/oddshaven
```

Generate secure secrets:
```bash
# Generate random session secret
openssl rand -base64 32

# Generate new VAPID keys
# Visit: https://web-push-codelab.glitch.me/
```

### 5. Create Data Directory

```bash
sudo mkdir -p /var/lib/oddshaven
sudo chown oddshaven:oddshaven /var/lib/oddshaven
sudo chmod 755 /var/lib/oddshaven
```

### 6. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'oddshaven-app',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/oddshaven/app-error.log',
      out_file: '/var/log/oddshaven/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'oddshaven-push',
      script: 'push-server.js',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/var/log/oddshaven/push-error.log',
      out_file: '/var/log/oddshaven/push-out.log',
      autorestart: true
    }
  ]
};
```

### 7. SSL Certificate (Let's Encrypt)

```bash
# Create logs directory first
sudo mkdir -p /var/log/oddshaven
sudo chown oddshaven:oddshaven /var/log/oddshaven

# Stop nginx temporarily
sudo systemctl stop nginx

# Get certificate for main domain
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email support@yourdomain.com \
  --agree-tos

# Get certificate for push server subdomain
sudo certbot certonly --standalone \
  -d push.yourdomain.com \
  --email support@yourdomain.com \
  --agree-tos

# Verify certificates
sudo ls -la /etc/letsencrypt/live/
```

### 8. Nginx Configuration

Create `/etc/nginx/sites-available/oddshaven`:

```bash
sudo nano /etc/nginx/sites-available/oddshaven
```

Paste:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com push.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# Main Application (HTTPS)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss;

    # Logging
    access_log /var/log/nginx/oddshaven-access.log;
    error_log /var/log/nginx/oddshaven-error.log;

    # Proxy to Node.js
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
        proxy_read_timeout 90;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Push Server (HTTPS)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name push.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/push.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/push.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    access_log /var/log/nginx/oddshaven-push-access.log;
    error_log /var/log/nginx/oddshaven-push-error.log;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/oddshaven /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Enable on boot
sudo systemctl enable nginx
```

### 9. Start Application

```bash
# Navigate to app directory
cd /var/www/oddshaven

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs
```

### 10. Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Check rules
sudo ufw status
```

### 11. Backup Strategy

Create `/opt/backup-oddshaven.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backups/oddshaven"
DB_FILE="/var/lib/oddshaven/database.sqlite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp $DB_FILE $BACKUP_DIR/database_$TIMESTAMP.sqlite

# Backup .env (encrypted)
tar -czf $BACKUP_DIR/env_$TIMESTAMP.tar.gz /var/www/oddshaven/.env

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $TIMESTAMP"
```

Make executable and add to crontab:

```bash
sudo chmod +x /opt/backup-oddshaven.sh

# Edit crontab
sudo crontab -e

# Add line (runs daily at 2 AM)
0 2 * * * /opt/backup-oddshaven.sh
```

### 12. Monitoring & Logging

```bash
# View application logs
pm2 logs oddshaven-app
pm2 logs oddshaven-push

# Monitor resources
pm2 monit

# View nginx logs
sudo tail -f /var/log/nginx/oddshaven-access.log
sudo tail -f /var/log/nginx/oddshaven-error.log

# Check disk space
df -h

# Check memory usage
free -h
```

---

## Verification Checklist

```bash
# ✅ Check if app is running
curl -I https://yourdomain.com

# ✅ Check push server
curl -I https://push.yourdomain.com

# ✅ Verify SSL certificate
sudo openssl x509 -in /etc/letsencrypt/live/yourdomain.com/fullchain.pem -text

# ��� Check PM2 status
pm2 status

# ✅ Check nginx status
sudo systemctl status nginx

# ✅ Test database connection
sqlite3 /var/lib/oddshaven/database.sqlite ".tables"

# ✅ Check service worker
curl https://yourdomain.com/service-worker.js

# ✅ Check manifest
curl https://yourdomain.com/manifest.json
```

---

## Post-Deployment

### 1. Change Default Admin Password

```bash
# Stop app
pm2 stop oddshaven-app

# Update .env with strong password
sudo nano /var/www/oddshaven/.env

# Restart
pm2 restart oddshaven-app
```

### 2. Generate New VAPID Keys

Visit: https://web-push-codelab.glitch.me/

Update in `.env`:

```bash
sudo nano /var/www/oddshaven/.env

VAPID_PUBLIC_KEY=your-new-key
VAPID_PRIVATE_KEY=your-new-key

pm2 restart oddshaven-push
```

### 3. Enable Automatic SSL Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Auto renewal (runs daily)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 4. Setup Email Alerts

```bash
# Install mail-utils
sudo apt install -y mailutils

# Edit crontab for alerts
sudo crontab -e

# Add health check
*/5 * * * * curl -s https://yourdomain.com > /dev/null || mail -s "OddsHaven Down" admin@yourdomain.com
```

---

## Troubleshooting

### App not starting
```bash
pm2 logs oddshaven-app --lines 50

# Check if port 3000 is in use
sudo lsof -i :3000

# Kill process if needed
sudo kill -9 <PID>
```

### SSL certificate error
```bash
# Renew certificate
sudo certbot renew

# Restart nginx
sudo systemctl restart nginx
```

### High memory usage
```bash
pm2 save
pm2 kill
pm2 start ecosystem.config.js
```

### Database locked
```bash
# Restart app
pm2 restart oddshaven-app

# If stuck, remove lock file
rm /var/lib/oddshaven/database.sqlite-wal
rm /var/lib/oddshaven/database.sqlite-shm
```

---

## Performance Tuning

```javascript
// Add to server.js for production
const compression = require('compression');
app.use(compression());

// Cache static files
app.use((req, res, next) => {
  if (req.url.match(/\.(js|css|png|jpg|svg|woff2)$/)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.set('Cache-Control', 'public, max-age=300');
  }
  next();
});
```

---

## Summary

✅ Server setup complete  
✅ Application deployed  
✅ SSL certificate installed  
✅ Nginx configured  
✅ PM2 managing processes  
✅ Backup strategy in place  
✅ Monitoring enabled  

**Your app is now live at https://yourdomain.com 🚀**
