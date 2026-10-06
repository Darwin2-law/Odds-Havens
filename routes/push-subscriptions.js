const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('../middleware/auth');

// Get database pool from config
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Subscribe device to push notifications
router.post('/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  const customerId = req.user.id;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    const connection = await pool.getConnection();

    // Extract browser and device info from user agent
    const userAgent = req.headers['user-agent'];
    const browserName = userAgent.includes('Chrome') ? 'Chrome' : 
                       userAgent.includes('Firefox') ? 'Firefox' : 
                       userAgent.includes('Safari') ? 'Safari' : 'Unknown';
    const deviceType = userAgent.includes('Mobile') ? 'mobile' : 'desktop';

    // Check if subscription already exists (same endpoint)
    const [existing] = await connection.execute(
      'SELECT id FROM push_subscriptions WHERE endpoint = ?',
      [subscription.endpoint]
    );

    if (existing.length > 0) {
      // Update last_used_at
      await connection.execute(
        'UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?',
        [existing[0].id]
      );
      connection.release();
      return res.status(200).json({ 
        message: 'Device already subscribed',
        subscriptionId: existing[0].id 
      });
    }

    // Insert new subscription
    const [result] = await connection.execute(
      `INSERT INTO push_subscriptions 
       (customer_id, endpoint, auth_key, p256dh_key, browser_name, device_type, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        customerId,
        subscription.endpoint,
        subscription.keys.auth,
        subscription.keys.p256dh,
        browserName,
        deviceType
      ]
    );

    // Ensure notification preferences exist for customer
    await connection.execute(
      `INSERT IGNORE INTO notification_preferences (customer_id) VALUES (?)`,
      [customerId]
    );

    connection.release();

    res.status(201).json({
      message: 'Device subscribed successfully',
      subscriptionId: result.insertId,
      browserName,
      deviceType
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe device' });
  }
});

// Unsubscribe device
router.post('/unsubscribe', authenticateToken, async (req, res) => {
  const { endpoint } = req.body;
  const customerId = req.user.id;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  try {
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE push_subscriptions SET is_active = 0 WHERE endpoint = ? AND customer_id = ?',
      [endpoint, customerId]
    );

    connection.release();
    res.status(200).json({ message: 'Device unsubscribed' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe device' });
  }
});

// Get customer's active subscriptions
router.get('/my-devices', authenticateToken, async (req, res) => {
  const customerId = req.user.id;

  try {
    const connection = await pool.getConnection();

    const [subscriptions] = await connection.execute(
      `SELECT id, browser_name, device_type, created_at, last_used_at 
       FROM push_subscriptions 
       WHERE customer_id = ? AND is_active = 1
       ORDER BY last_used_at DESC`,
      [customerId]
    );

    connection.release();

    res.status(200).json({
      devices: subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Fetch devices error:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Get notification preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  const customerId = req.user.id;

  try {
    const connection = await pool.getConnection();

    const [prefs] = await connection.execute(
      `SELECT * FROM notification_preferences WHERE customer_id = ?`,
      [customerId]
    );

    connection.release();

    if (prefs.length === 0) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    res.status(200).json(prefs[0]);
  } catch (error) {
    console.error('Fetch preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update notification preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  const customerId = req.user.id;
  const {
    push_enabled,
    announcements,
    bet_updates,
    match_alerts,
    promotional,
    quiet_hours_enabled,
    quiet_start,
    quiet_end
  } = req.body;

  try {
    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE notification_preferences 
       SET push_enabled = ?, announcements = ?, bet_updates = ?, match_alerts = ?, 
           promotional = ?, quiet_hours_enabled = ?, quiet_start = ?, quiet_end = ?
       WHERE customer_id = ?`,
      [
        push_enabled ?? true,
        announcements ?? true,
        bet_updates ?? true,
        match_alerts ?? true,
        promotional ?? false,
        quiet_hours_enabled ?? false,
        quiet_start || null,
        quiet_end || null,
        customerId
      ]
    );

    connection.release();

    res.status(200).json({ message: 'Preferences updated' });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
