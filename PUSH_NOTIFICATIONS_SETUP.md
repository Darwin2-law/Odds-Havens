# VAPID Keys Setup Guide

## Your VAPID Keys

**Public Key:**
```
BPoE2pgmMsW9RrBy2_gpe70O5nvp3iY-zRfpfUQMiptRnN4l2rAORAKxajsyBdEYMjQSsc3_REw4qaKUE_716bw
```

**Private Key:**
```
is8QMaI67BYmF-adFaHnl64YkMC-LCfwLQu_FUySzrI
```

---

## ⚠️ CRITICAL SECURITY WARNING

**These keys are now public. You MUST:**

1. **Generate new VAPID keys immediately** at https://web-push-codelab.glitch.me/
2. **Never commit private keys to version control**
3. **Rotate keys regularly in production**
4. **Store keys securely in `.env` file only**

---

## Setup Instructions

### Step 1: Add to `.env` File

Create or update `.env` in your project root:

```bash
# Push Notification Configuration
VAPID_SUBJECT=mailto:support@oddshaven.com
VAPID_PUBLIC_KEY=BPoE2pgmMsW9RrBy2_gpe70O5nvp3iY-zRfpfUQMiptRnN4l2rAORAKxajsyBdEYMjQSsc3_REw4qaKUE_716bw
VAPID_PRIVATE_KEY=is8QMaI67BYmF-adFaHnl64YkMC-LCfwLQu_FUySzrI

# Push Notification Server
PUSH_SERVER_PORT=3001
PUSH_SERVER_URL=http://localhost:3001
```

**IMPORTANT:** Add `.env` to `.gitignore`:
```bash
echo ".env" >> .gitignore
```

---

### Step 2: Install Dependencies

```bash
npm install web-push express cors dotenv
```

---

### Step 3: Frontend - Subscribe to Notifications

Add to your HTML `<head>` tag:

```html
<meta name="theme-color" content="#c1f36c">
<link rel="manifest" href="/manifest.json">
<script src="/pwa-config.js"></script>
<script src="/push-notification-client.js"></script>
```

---

### Step 4: Create Push Notification Server

Create `push-server.js`:

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PUSH_SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@oddshaven.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// In-memory subscriptions (use database in production)
let subscriptions = [];

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'OddsHaven Push Notification Server',
    status: 'online',
    vapidConfigured: !!process.env.VAPID_PUBLIC_KEY
  });
});

// Get public VAPID key
app.get('/public-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
});

// Subscribe to push notifications
app.post('/subscribe', (req, res) => {
  const subscription = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({
      success: false,
      message: 'Invalid subscription object'
    });
  }

  // Prevent duplicates
  const exists = subscriptions.some(
    (sub) => sub.endpoint === subscription.endpoint
  );

  if (!exists) {
    subscriptions.push(subscription);
    console.log(`[Push] New subscription. Total: ${subscriptions.length}`);
  }

  res.status(201).json({
    success: true,
    message: 'Subscription saved',
    totalSubscribers: subscriptions.length
  });
});

// Unsubscribe from push notifications
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({
      success: false,
      message: 'Endpoint required'
    });
  }

  const index = subscriptions.findIndex((sub) => sub.endpoint === endpoint);
  
  if (index !== -1) {
    subscriptions.splice(index, 1);
    console.log(`[Push] Unsubscribed. Total: ${subscriptions.length}`);
  }

  res.json({
    success: true,
    message: 'Unsubscribed',
    totalSubscribers: subscriptions.length
  });
});

// Send notification to all subscribers
app.post('/send', async (req, res) => {
  const {
    title = 'OddsHaven',
    body = 'You have a new notification',
    url = '/',
    icon = '/icons/icon-192.png',
    badge = '/icons/icon-192.png',
    tag = 'oddshaven'
  } = req.body;

  if (subscriptions.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No active subscriptions'
    });
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    icon,
    badge,
    tag,
    timestamp: new Date().toISOString()
  });

  const results = [];

  console.log(`[Push] Sending to ${subscriptions.length} subscribers`);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      results.push({
        success: true,
        endpoint: subscription.endpoint.substring(0, 50) + '...'
      });
    } catch (error) {
      console.error(`[Push] Send failed:`, error.statusCode, error.message);

      // Remove invalid subscriptions
      if (error.statusCode === 410 || error.statusCode === 404) {
        const index = subscriptions.indexOf(subscription);
        if (index !== -1) {
          subscriptions.splice(index, 1);
          console.log(`[Push] Removed invalid subscription`);
        }
      }

      results.push({
        success: false,
        endpoint: subscription.endpoint.substring(0, 50) + '...',
        error: error.message
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  res.json({
    success: true,
    sent: successCount,
    failed: results.length - successCount,
    total: results.length,
    results
  });
});

// Send notification to specific subscriber
app.post('/send-to-user', async (req, res) => {
  const { userEndpoint, title, body, url } = req.body;

  if (!userEndpoint) {
    return res.status(400).json({
      success: false,
      message: 'User endpoint required'
    });
  }

  const subscription = subscriptions.find(
    (sub) => sub.endpoint === userEndpoint
  );

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: 'User not subscribed'
    });
  }

  const payload = JSON.stringify({
    title: title || 'OddsHaven',
    body: body || 'You have a new notification',
    url: url || '/',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  });

  try {
    await webpush.sendNotification(subscription, payload);
    res.json({
      success: true,
      message: 'Notification sent'
    });
  } catch (error) {
    console.error('[Push] Send failed:', error.message);

    if (error.statusCode === 410 || error.statusCode === 404) {
      const index = subscriptions.indexOf(subscription);
      if (index !== -1) {
        subscriptions.splice(index, 1);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get subscriber count
app.get('/stats', (req, res) => {
  res.json({
    totalSubscribers: subscriptions.length,
    subscriptions: subscriptions.map((sub) => ({
      endpoint: sub.endpoint.substring(0, 50) + '...',
      subscription: sub
    }))
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('=================================');
  console.log('  ODDSHAVEN PUSH SERVER');
  console.log('=================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`VAPID: ${process.env.VAPID_PUBLIC_KEY ? 'Configured' : 'Missing'}`);
  console.log(`Status: ONLINE`);
  console.log('=================================');
  console.log('');
});
```

---

### Step 5: Create Client Script

Create `push-notification-client.js`:

```javascript
/**
 * Push Notification Client
 * Handles subscription and notification setup on the frontend
 */

const PushNotificationClient = {
  // Push server configuration
  PUSH_SERVER_URL: 'http://localhost:3001', // Change to your push server URL

  // Initialize push notifications
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[Push] Push notifications not supported');
      return false;
    }

    try {
      // Check if already subscribed
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        console.log('[Push] Already subscribed');
        this.updateSubscriptionUI(true);
        return subscription;
      }

      // Get public key from server
      const response = await fetch(`${this.PUSH_SERVER_URL}/public-key`);
      const data = await response.json();
      const publicKey = data.publicKey;

      if (!publicKey) {
        console.error('[Push] Public key not available');
        return false;
      }

      // Subscribe
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });

      console.log('[Push] New subscription created');

      // Send to server
      await this.saveSubscription(newSubscription);

      this.updateSubscriptionUI(true);
      return newSubscription;
    } catch (err) {
      console.error('[Push] Initialization failed:', err);
      return false;
    }
  },

  // Save subscription to server
  async saveSubscription(subscription) {
    try {
      const response = await fetch(`${this.PUSH_SERVER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      const data = await response.json();
      console.log('[Push] Subscription saved:', data);
      return data;
    } catch (err) {
      console.error('[Push] Failed to save subscription:', err);
      throw err;
    }
  },

  // Unsubscribe from push
  async unsubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        console.log('[Push] Not currently subscribed');
        return false;
      }

      // Remove from server
      await fetch(`${this.PUSH_SERVER_URL}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });

      // Unsubscribe locally
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed');

      this.updateSubscriptionUI(false);
      return true;
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
      return false;
    }
  },

  // Check subscription status
  async getSubscriptionStatus() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return subscription ? true : false;
    } catch (err) {
      console.error('[Push] Status check failed:', err);
      return false;
    }
  },

  // Request notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[Push] Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },

  // Enable notifications
  async enableNotifications() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.warn('[Push] Notification permission denied');
      return false;
    }

    return await this.init();
  },

  // Update UI
  updateSubscriptionUI(isSubscribed) {
    const btn = document.getElementById('push-notification-toggle');
    if (!btn) return;

    if (isSubscribed) {
      btn.textContent = 'Disable Notifications';
      btn.classList.add('active');
    } else {
      btn.textContent = 'Enable Notifications';
      btn.classList.remove('active');
    }
  },

  // Setup UI button
  setupButton() {
    let btn = document.getElementById('push-notification-toggle');
    
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'push-notification-toggle';
      btn.className = 'icon-button';
      btn.title = 'Toggle Notifications';
      btn.innerHTML = '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
      
      const topActions = document.querySelector('.top-actions');
      if (topActions) {
        topActions.insertBefore(btn, topActions.firstChild);
      }
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const isSubscribed = await this.getSubscriptionStatus();
      
      if (isSubscribed) {
        await this.unsubscribe();
      } else {
        await this.enableNotifications();
      }
    });

    // Update UI on load
    this.getSubscriptionStatus().then((status) => {
      this.updateSubscriptionUI(status);
    });
  },

  // Convert base64 to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }
};

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    PushNotificationClient.setupButton();
    PushNotificationClient.init();
  });
} else {
  PushNotificationClient.setupButton();
  PushNotificationClient.init();
}
```

---

## Step 6: Update HTML

Add to `haven.html` before `</body>`:

```html
<!-- Service Worker and PWA Support -->
<script src="/pwa-config.js"></script>
<script src="/push-notification-client.js"></script>

<!-- Install App Button (will be shown if installable) -->
<button id="install-app-btn" class="icon-button" title="Install App">
  <i class="fa-solid fa-download"></i> Install
</button>
```

---

## Step 7: Update server.js

Add CORS and push endpoints to your main server:

```javascript
// Add at top of server.js
require('dotenv').config();

// Add CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API endpoint to get push server public key
app.get('/api/push-public-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
});

// API endpoint to send notifications from admin
app.post('/api/send-notification', requiresAdmin, async (req, res) => {
  const { title, body, url } = req.body;

  if (!title || !body) {
    return res.status(400).json({ 
      error: 'Title and body are required' 
    });
  }

  try {
    const response = await fetch('http://localhost:3001/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        url: url || '/',
        tag: 'prediction-update'
      })
    });

    const data = await response.json();
    return res.json({
      ok: true,
      sent: data.sent,
      failed: data.failed
    });
  } catch (err) {
    console.error('Push notification failed:', err.message);
    return res.status(500).json({ 
      error: 'Failed to send notifications' 
    });
  }
});
```

---

## Step 8: Run Both Servers

**Terminal 1 - Main App Server:**
```bash
npm start
# Server runs on http://localhost:3000
```

**Terminal 2 - Push Notification Server:**
```bash
node push-server.js
# Push server runs on http://localhost:3001
```

---

## Step 9: Test Push Notifications

### Using curl:

```bash
# Send to all subscribers
curl -X POST http://localhost:3001/send \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Prediction",
    "body": "Chelsea vs Manchester United prediction available",
    "url": "/?view=predictions",
    "tag": "prediction-update"
  }'

# Get subscriber count
curl http://localhost:3001/stats
```

### From Admin Dashboard:

1. Log in as admin
2. Go to Notifications section
3. Create and send notification
4. Should reach all subscribed users

---

## Production Deployment

### Using PM2 to manage servers:

```bash
# Install PM2
npm install -g pm2

# Create ecosystem.config.js
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'oddshaven-app',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'oddshaven-push',
      script: 'push-server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
```

Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Public key not available" | Ensure VAPID_PUBLIC_KEY is set in .env and push server is running |
| Subscriptions not persisting | Switch to database instead of in-memory array in production |
| Notifications not showing | Check notification permissions in browser settings |
| CORS errors | Ensure main server allows cross-origin requests to push server |
| Invalid VAPID keys | Generate new keys at https://web-push-codelab.glitch.me/ |

---

## Security Best Practices

✅ Store VAPID keys in `.env` only  
✅ Never commit `.env` to version control  
✅ Rotate keys every 90 days in production  
✅ Use HTTPS in production  
✅ Validate subscription endpoints  
✅ Rate limit push notifications  
✅ Monitor push failures and clean up invalid subscriptions  
✅ Require admin authentication for send endpoints  

---

## Next Steps

1. ✅ Set up both servers
2. ✅ Test push notifications
3. ✅ Deploy to production with HTTPS
4. ✅ Switch to database for subscriptions (PostgreSQL/MongoDB)
5. ✅ Add notification analytics and delivery tracking
