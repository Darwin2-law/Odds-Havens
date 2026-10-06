const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const notificationService = require('../services/notification-service');

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
 * POST /admin/notifications/send
 * Send notification to specific customer
 * Admin sends: { customerId, title, body, image_url?, click_action?, type? }
 */
router.post('/send', authenticateToken, requireAdmin, async (req, res) => {
  const { customerId, title, body, image_url, click_action, type } = req.body;
  const adminId = req.user.id;

  if (!customerId || !title || !body) {
    return res.status(400).json({ error: 'customerId, title, and body are required' });
  }

  try {
    const notification = {
      title,
      body,
      image_url: image_url || null,
      click_action: click_action || '/',
      type: type || 'admin_message'
    };

    const result = await notificationService.sendToCustomer(customerId, notification, adminId);

    res.status(200).json({
      message: 'Notification sent',
      customerId,
      result
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * POST /admin/notifications/broadcast
 * Send notification to all customers or segment
 * Admin sends: { customerIds?, title, body, campaign_name?, image_url?, click_action?, type? }
 */
router.post('/broadcast', authenticateToken, requireAdmin, async (req, res) => {
  const { customerIds, title, body, campaign_name, image_url, click_action, type } = req.body;
  const adminId = req.user.id;

  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  try {
    const notification = {
      title,
      body,
      image_url: image_url || null,
      click_action: click_action || '/',
      type: type || 'announcement'
    };

    // Insert campaign record
    const connection = await pool.getConnection();
    const [queueResult] = await connection.execute(
      `INSERT INTO notification_queue
       (campaign_name, target_type, title, body, image_url, click_action, notification_type, admin_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
      [
        campaign_name || `Broadcast ${new Date().toISOString()}`,
        customerIds ? 'segment' : 'broadcast',
        title,
        body,
        image_url,
        click_action,
        type,
        adminId
      ]
    );

    connection.release();

    // Send notifications
    const result = await notificationService.sendBulk(customerIds || null, notification, adminId);

    // Update campaign with results
    const updateConnection = await pool.getConnection();
    await updateConnection.execute(
      `UPDATE notification_queue
       SET total_recipients = ?, successful_sends = ?, failed_sends = ?, processed_at = NOW(), status = 'completed'
       WHERE id = ?`,
      [result.totalRecipients, result.totalSent, result.totalFailed, queueResult.insertId]
    );
    updateConnection.release();

    res.status(200).json({
      message: 'Broadcast sent',
      campaignId: queueResult.insertId,
      result
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

/**
 * GET /admin/notifications/campaigns
 * Get list of notification campaigns
 */
router.get('/campaigns', authenticateToken, requireAdmin, async (req, res) => {
  const { limit = 50 } = req.query;

  try {
    const connection = await pool.getConnection();

    const [campaigns] = await connection.execute(
      `SELECT id, campaign_name, target_type, title, total_recipients, successful_sends, 
              failed_sends, status, created_at, processed_at
       FROM notification_queue
       ORDER BY created_at DESC
       LIMIT ?`,
      [parseInt(limit)]
    );

    connection.release();

    res.status(200).json({ campaigns });
  } catch (error) {
    console.error('Fetch campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

/**
 * GET /admin/notifications/customer/:customerId/history
 * Get notification history for specific customer
 */
router.get('/customer/:customerId/history', authenticateToken, requireAdmin, async (req, res) => {
  const { customerId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const connection = await pool.getConnection();

    const [logs] = await connection.execute(
      `SELECT id, title, body, notification_type, send_status, sent_at, error_message, created_at
       FROM notification_log
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [parseInt(customerId), parseInt(limit)]
    );

    connection.release();

    res.status(200).json({ logs });
  } catch (error) {
    console.error('Fetch history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /admin/notifications/customer/:customerId/subscriptions
 * Get all devices subscribed by a customer
 */
router.get('/customer/:customerId/subscriptions', authenticateToken, requireAdmin, async (req, res) => {
  const { customerId } = req.params;

  try {
    const connection = await pool.getConnection();

    const [subscriptions] = await connection.execute(
      `SELECT id, browser_name, device_type, is_active, created_at, last_used_at
       FROM push_subscriptions
       WHERE customer_id = ?
       ORDER BY last_used_at DESC`,
      [parseInt(customerId)]
    );

    connection.release();

    res.status(200).json({ subscriptions });
  } catch (error) {
    console.error('Fetch subscriptions error:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * POST /admin/notifications/revoke
 * Revoke/disable a customer's device subscription
 * Admin sends: { subscriptionId }
 */
router.post('/revoke', authenticateToken, requireAdmin, async (req, res) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    return res.status(400).json({ error: 'subscriptionId required' });
  }

  try {
    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE push_subscriptions SET is_active = 0 WHERE id = ?`,
      [subscriptionId]
    );

    connection.release();

    res.status(200).json({ message: 'Subscription revoked' });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke subscription' });
  }
});

/**
 * GET /admin/notifications/stats
 * Get notification statistics
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Total active subscriptions
    const [totalSubs] = await connection.execute(
      `SELECT COUNT(*) as count FROM push_subscriptions WHERE is_active = 1`
    );

    // Notifications sent today
    const [todayStats] = await connection.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN send_status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN send_status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM notification_log
       WHERE DATE(created_at) = DATE(NOW())`
    );

    // Top notification types
    const [topTypes] = await connection.execute(
      `SELECT notification_type, COUNT(*) as count
       FROM notification_log
       WHERE send_status = 'sent'
       GROUP BY notification_type
       ORDER BY count DESC
       LIMIT 10`
    );

    connection.release();

    res.status(200).json({
      stats: {
        activeSubscriptions: totalSubs[0].count,
        todayNotifications: todayStats[0].total,
        todaySent: todayStats[0].sent,
        todayFailed: todayStats[0].failed,
        topTypes
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
