require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PUSH_SERVER_PORT || 3001;
const DB_PATH = path.join(__dirname, 'push-subscriptions.db');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Push] Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('[Push] Connected to subscription database');
});

// Create subscriptions table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Configure VAPID keys
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.error('[Push] VAPID keys not configured in .env');
  process.exit(1);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@oddshaven.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Logging utility
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
};

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'OddsHaven Push Notification Server',
    status: 'online',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    vapidConfigured: !!process.env.VAPID_PUBLIC_KEY,
    dbConnected: true
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
  const userId = req.query.userId || null;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({
      success: false,
      message: 'Invalid subscription object'
    });
  }

  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  db.run(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET last_active = CURRENT_TIMESTAMP`,
    [endpoint, p256dh, auth, userId],
    function (err) {
      if (err) {
        log(`Subscription save failed: ${err.message}`, 'error');
        return res.status(500).json({
          success: false,
          message: 'Failed to save subscription'
        });
      }

      db.get('SELECT COUNT(*) as count FROM push_subscriptions', (countErr, row) => {
        const total = row ? row.count : 0;
        log(`Subscription saved (user: ${userId || 'anonymous'}). Total: ${total}`, 'info');

        res.status(201).json({
          success: true,
          message: 'Subscription saved',
          totalSubscribers: total
        });
      });
    }
  );
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

  db.run(
    'DELETE FROM push_subscriptions WHERE endpoint = ?',
    [endpoint],
    function (err) {
      if (err) {
        log(`Unsubscribe failed: ${err.message}`, 'error');
        return res.status(500).json({
          success: false,
          message: 'Failed to unsubscribe'
        });
      }

      db.get('SELECT COUNT(*) as count FROM push_subscriptions', (countErr, row) => {
        const total = row ? row.count : 0;
        log(`Unsubscribed. Total: ${total}`, 'info');

        res.json({
          success: true,
          message: 'Unsubscribed',
          totalSubscribers: total
        });
      });
    }
  );
});

// Send notification to all subscribers
app.post('/send', async (req, res) => {
  const {
    title = 'OddsHaven',
    body = 'You have a new notification',
    url = '/',
    icon = '/icons/icon-192.png',
    badge = '/icons/icon-192.png',
    tag = 'oddshaven',
    userIds = null
  } = req.body;

  if (!title || !body) {
    return res.status(400).json({
      success: false,
      message: 'Title and body are required'
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

  // Build query
  let query = 'SELECT id, endpoint, p256dh, auth FROM push_subscriptions';
  const params = [];

  if (userIds && Array.isArray(userIds) && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    query += ` WHERE user_id IN (${placeholders})`;
    params.push(...userIds);
  }

  db.all(query, params, async (err, subscriptions) => {
    if (err) {
      log(`Query failed: ${err.message}`, 'error');
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve subscriptions'
      });
    }

    if (subscriptions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active subscriptions'
      });
    }

    log(`Sending to ${subscriptions.length} subscribers`, 'info');

    const results = [];
    const failedIds = [];

    for (const sub of subscriptions) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        await webpush.sendNotification(subscription, payload);
        results.push({ success: true, id: sub.id });
      } catch (error) {
        log(`Send failed: ${error.statusCode} ${error.message}`, 'error');

        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          failedIds.push(sub.id);
        }

        results.push({
          success: false,
          id: sub.id,
          error: error.message,
          statusCode: error.statusCode
        });
      }
    }

    // Clean up failed subscriptions
    if (failedIds.length > 0) {
      const placeholders = failedIds.map(() => '?').join(',');
      db.run(
        `DELETE FROM push_subscriptions WHERE id IN (${placeholders})`,
        failedIds,
        (deleteErr) => {
          if (deleteErr) {
            log(`Cleanup failed: ${deleteErr.message}`, 'warn');
          } else {
            log(`Removed ${failedIds.length} invalid subscriptions`, 'info');
          }
        }
      );
    }

    const successCount = results.filter((r) => r.success).length;
    log(`Sent to ${successCount}/${results.length} subscribers`, 'info');

    res.json({
      success: true,
      sent: successCount,
      failed: results.length - successCount,
      total: results.length,
      message: `Sent to ${successCount}/${results.length} subscribers`
    });
  });
});

// Send to specific user
app.post('/send-to-user', async (req, res) => {
  const { userEndpoint, title, body, url } = req.body;

  if (!userEndpoint) {
    return res.status(400).json({
      success: false,
      message: 'User endpoint required'
    });
  }

  db.get(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ?',
    [userEndpoint],
    async (err, sub) => {
      if (err || !sub) {
        return res.status(404).json({
          success: false,
          message: 'User not subscribed'
        });
      }

      const payload = JSON.stringify({
        title: title || 'OddsHaven',
        body: body || 'New notification',
        url: url || '/',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png'
      });

      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        await webpush.sendNotification(subscription, payload);
        res.json({ success: true, message: 'Notification sent' });
      } catch (error) {
        log(`Send to user failed: ${error.message}`, 'error');

        if (error.statusCode === 410 || error.statusCode === 404) {
          db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [userEndpoint]);
        }

        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    }
  );
});

// Get statistics
app.get('/stats', (req, res) => {
  db.all(
    'SELECT id, endpoint, user_id, created_at, last_active FROM push_subscriptions ORDER BY last_active DESC',
    (err, subscriptions) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to retrieve stats'
        });
      }

      res.json({
        totalSubscribers: subscriptions.length,
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          endpoint: sub.endpoint.substring(0, 50) + '...',
          userId: sub.user_id,
          createdAt: sub.created_at,
          lastActive: sub.last_active
        }))
      });
    }
  );
});

// Test notification
app.post('/test', async (req, res) => {
  db.get('SELECT endpoint, p256dh, auth FROM push_subscriptions LIMIT 1', async (err, sub) => {
    if (err || !sub) {
      return res.status(400).json({
        success: false,
        message: 'No subscribers to test with'
      });
    }

    const payload = JSON.stringify({
      title: 'OddsHaven Test',
      body: 'This is a test notification',
      url: '/',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png'
    });

    try {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      await webpush.sendNotification(subscription, payload);
      res.json({
        success: true,
        message: 'Test notification sent'
      });
    } catch (error) {
      log(`Test notification failed: ${error.message}`, 'error');
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
});

// Clear subscriptions (admin only)
app.post('/clear', (req, res) => {
  db.run('DELETE FROM push_subscriptions', function (err) {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to clear subscriptions'
      });
    }

    log(`Cleared ${this.changes} subscriptions`, 'warn');
    res.json({
      success: true,
      clearedCount: this.changes
    });
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  log(`Unhandled error: ${err.message}`, 'error');
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('=================================');
  console.log('  ODDSHAVEN PUSH SERVER v1.0');
  console.log('=================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`VAPID: ${process.env.VAPID_PUBLIC_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Status: ONLINE`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=================================');
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /                    - Health check');
  console.log('  GET  /public-key          - Get VAPID public key');
  console.log('  POST /subscribe           - Subscribe to notifications');
  console.log('  POST /unsubscribe         - Unsubscribe from notifications');
  console.log('  POST /send                - Send to all subscribers');
  console.log('  POST /send-to-user        - Send to specific user');
  console.log('  GET  /stats               - Get subscriber statistics');
  console.log('  POST /test                - Send test notification');
  console.log('  POST /clear               - Clear all subscriptions');
  console.log('');
});
