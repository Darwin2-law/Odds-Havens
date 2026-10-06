const webpush = require('web-push');
const mysql = require('mysql2/promise');

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@oddshaven.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Database pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Send notification to single customer
 * @param {number} customerId - The customer ID
 * @param {Object} notification - { title, body, image_url, click_action, type }
 * @param {number} adminId - Admin sending the notification
 * @returns {Promise<Object>} Result with sent count and failures
 */
async function sendToCustomer(customerId, notification, adminId = null) {
  const connection = await pool.getConnection();

  try {
    // Get customer's active subscriptions
    const [subscriptions] = await connection.execute(
      `SELECT id, endpoint, auth_key, p256dh_key FROM push_subscriptions 
       WHERE customer_id = ? AND is_active = 1`,
      [customerId]
    );

    if (subscriptions.length === 0) {
      console.log(`No active subscriptions for customer ${customerId}`);
      return { sent: 0, failed: 0, details: 'No active devices' };
    }

    // Check customer's notification preferences
    const [prefs] = await connection.execute(
      `SELECT * FROM notification_preferences WHERE customer_id = ?`,
      [customerId]
    );

    const preferences = prefs[0];
    if (preferences && !preferences.push_enabled) {
      console.log(`Customer ${customerId} has push notifications disabled`);
      return { sent: 0, failed: 0, details: 'Notifications disabled by customer' };
    }

    // Check if in quiet hours
    if (preferences && preferences.quiet_hours_enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      if (currentTime >= preferences.quiet_start && currentTime < preferences.quiet_end) {
        console.log(`Customer ${customerId} in quiet hours`);
        // Still queue but don't send
        await queueNotification(connection, customerId, notification, 'pending', adminId);
        return { sent: 0, queued: 1, details: 'In quiet hours' };
      }
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.image_url || '/icons/app-icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: notification.type || 'default',
      data: {
        url: notification.click_action || '/',
        type: notification.type || 'announcement'
      }
    });

    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    // Send to each device
    for (const sub of subscriptions) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth_key,
            p256dh: sub.p256dh_key
          }
        };

        await webpush.sendNotification(subscription, payload);

        // Log successful send
        await connection.execute(
          `INSERT INTO notification_log 
           (customer_id, subscription_id, title, body, image_url, click_action, 
            notification_type, send_status, sent_at, admin_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', NOW(), ?)`,
          [
            customerId,
            sub.id,
            notification.title,
            notification.body,
            notification.image_url,
            notification.click_action,
            notification.type || 'announcement',
            adminId
          ]
        );

        // Update last_used_at
        await connection.execute(
          `UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?`,
          [sub.id]
        );

        sentCount++;
      } catch (error) {
        failedCount++;
        failures.push({
          endpoint: sub.endpoint,
          error: error.message
        });

        // Handle subscription errors
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Endpoint invalid or expired
          await connection.execute(
            `UPDATE push_subscriptions SET is_active = 0 WHERE id = ?`,
            [sub.id]
          );
        }

        // Log failed send
        await connection.execute(
          `INSERT INTO notification_log 
           (customer_id, subscription_id, title, body, image_url, click_action,
            notification_type, send_status, error_message, admin_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?)`,
          [
            customerId,
            sub.id,
            notification.title,
            notification.body,
            notification.image_url,
            notification.click_action,
            notification.type || 'announcement',
            error.message,
            adminId
          ]
        );
      }
    }

    return { sent: sentCount, failed: failedCount, failures };
  } finally {
    connection.release();
  }
}

/**
 * Send notification to multiple customers (segment or broadcast)
 * @param {Array<number>|null} customerIds - Array of customer IDs, or null for broadcast
 * @param {Object} notification - Notification content
 * @param {number} adminId - Admin ID
 * @returns {Promise<Object>} Result summary
 */
async function sendBulk(customerIds, notification, adminId) {
  const connection = await pool.getConnection();

  try {
    let customers = customerIds;

    if (!customers) {
      // Broadcast to all customers with active subscriptions
      const [rows] = await connection.execute(
        `SELECT DISTINCT customer_id FROM push_subscriptions WHERE is_active = 1`
      );
      customers = rows.map(r => r.customer_id);
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const customerId of customers) {
      try {
        const result = await sendToCustomer(customerId, notification, adminId);
        totalSent += result.sent || 0;
        totalFailed += result.failed || 0;
      } catch (error) {
        console.error(`Failed to send to customer ${customerId}:`, error);
        totalFailed++;
      }
    }

    return {
      totalRecipients: customers.length,
      totalSent,
      totalFailed,
      successRate: customers.length > 0 ? (totalSent / (totalSent + totalFailed) * 100).toFixed(2) + '%' : '0%'
    };
  } finally {
    connection.release();
  }
}

/**
 * Get customer's notification history
 * @param {number} customerId - Customer ID
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>} Notification history
 */
async function getNotificationHistory(customerId, limit = 20) {
  const connection = await pool.getConnection();

  try {
    const [logs] = await connection.execute(
      `SELECT id, title, body, notification_type, send_status, sent_at, error_message
       FROM notification_log
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [customerId, limit]
    );

    return logs;
  } finally {
    connection.release();
  }
}

/**
 * Queue notification for batch processing or scheduling
 * @param {Object} connection - MySQL connection
 * @param {number} customerId - Customer ID
 * @param {Object} notification - Notification content
 * @param {string} status - Queue status
 * @param {number} adminId - Admin ID
 */
async function queueNotification(connection, customerId, notification, status = 'pending', adminId) {
  await connection.execute(
    `INSERT INTO notification_log
     (customer_id, title, body, image_url, click_action, notification_type, send_status, admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId,
      notification.title,
      notification.body,
      notification.image_url,
      notification.click_action,
      notification.type || 'announcement',
      status,
      adminId
    ]
  );
}

module.exports = {
  sendToCustomer,
  sendBulk,
  getNotificationHistory,
  queueNotification
};
