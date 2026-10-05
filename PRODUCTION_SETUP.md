# OddsHaven Production Deployment Guide

## 🚀 Production Checklist

### Security
- [ ] Change `ADMIN_DEFAULT_PASSWORD` to a strong password
- [ ] Generate new VAPID keys: https://web-push-codelab.glitch.me/
- [ ] Set `SESSION_SECRET` to a cryptographically secure random string
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set `NODE_ENV=production`
- [ ] Secure `.env` file (never commit to Git)
- [ ] Enable firewall rules
- [ ] Set up rate limiting
- [ ] Enable request logging and monitoring

### Database
- [ ] Use production database (PostgreSQL recommended)
- [ ] Enable database backups (daily minimum)
- [ ] Configure database connection pooling
- [ ] Set up automated database optimization
- [ ] Enable query logging for performance monitoring

### HTTPS Setup

#### Option 1: Self-Signed Certificate (Testing)
```bash
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
```

#### Option 2: Let's Encrypt (Recommended)
```bash
npm install -g certbot
certbot certonly --standalone -d yourdomain.com

# Update .env
HTTPS_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
HTTPS_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
HTTPS_PORT=443
```

#### Option 3: Using nginx Reverse Proxy
```nginx
server {
  listen 443 ssl http2;
  server_name yourdomain.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}

server {
  listen 443 ssl http2;
  server_name push.yourdomain.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}

server {
  listen 80;
  server_name yourdomain.com push.yourdomain.com;
  return 301 https://$server_name$request_uri;
}
```

### Environment Variables

Create `.env` with production values:

```bash
NODE_ENV=production
PORT=3000

# Strong session secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-secure-random-secret-here

# New VAPID keys from https://web-push-codelab.glitch.me/
VAPID_PUBLIC_KEY=your-production-public-key
VAPID_PRIVATE_KEY=your-production-private-key
VAPID_SUBJECT=mailto:your-email@yourdomain.com

# Database
DB_PATH=/var/lib/oddshaven/database.sqlite

# Admin credentials (MUST BE CHANGED)
ADMIN_DEFAULT_PASSWORD=your-strong-password-here

# Push server
PUSH_SERVER_URL=https://push.yourdomain.com
PUSH_SERVER_PORT=3001

# HTTPS
HTTPS_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
HTTPS_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
HTTPS_PORT=443
```

### Using PM2 for Process Management

```bash
npm install -g pm2
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'oddshaven-app',
      script: 'server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/oddshaven-app-error.log',
      out_file: '/var/log/oddshaven-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'oddshaven-push',
      script: 'push-server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/var/log/oddshaven-push-error.log',
      out_file: '/var/log/oddshaven-push-out.log',
      max_memory_restart: '500M'
    }
  ]
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
pm2 logs
```

### Monitoring and Logging

```bash
# Monitor with PM2
pm2 monit

# View logs
pm2 logs oddshaven-app
pm2 logs oddshaven-push

# Rotate logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
```

### Backup Strategy

```bash
#!/bin/bash
# daily-backup.sh

BACKUP_DIR="/backups/oddshaven"
DB_FILE="/var/lib/oddshaven/database.sqlite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_FILE $BACKUP_DIR/database_$TIMESTAMP.sqlite

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /path/to/daily-backup.sh
```

### VAPID Key Rotation (Every 90 Days)

1. Generate new keys: https://web-push-codelab.glitch.me/
2. Update `.env` with new keys
3. All existing subscriptions will need to resubscribe
4. Notify users to re-enable notifications
5. Archive old keys

### Performance Optimization

```javascript
// Enable compression in server.js
const compression = require('compression');
app.use(compression());

// Enable caching headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600');
  next();
});
```

### Monitoring Stack

Recommended:
- PM2 Plus (monitoring)
- New Relic (APM)
- Sentry (error tracking)
- DataDog (logging)
- CloudFlare (CDN + DDoS protection)

### Deployment Steps

1. Clone repository to production server
2. Copy `.env` (with production values)
3. Run `npm install --production`
4. Run `node push-server.js` (background)
5. Run `npm start` (or `pm2 start ecosystem.config.js`)
6. Verify both services running:
   ```bash
   curl https://yourdomain.com
   curl https://push.yourdomain.com
   ```
7. Monitor logs:
   ```bash
   pm2 logs
   ```

### Rollback Plan

```bash
# If deployment fails
cd /var/www/oddshaven
git log --oneline  # Find previous commit
git checkout <commit-hash>
npm install
pm2 restart all
```

### Health Checks

Set up monitoring at regular intervals:

```bash
#!/bin/bash
# health-check.sh

echo "App Server: $(curl -s https://yourdomain.com/api/session | jq .)"
echo "Push Server: $(curl -s https://push.yourdomain.com | jq .)"
```

Add to crontab:
```bash
*/5 * * * * /path/to/health-check.sh >> /var/log/health-check.log 2>&1
```

### Support

- Logs: `/var/log/oddshaven-*.log`
- Database: `/var/lib/oddshaven/database.sqlite`
- Configuration: `/home/user/.env`
- PM2 Status: `pm2 status`
- PM2 Info: `pm2 info oddshaven-app`
