# OddsHaven Personalized Push Notifications API

Complete guide to the customer-specific notification system for OddsHaven.

---

## Overview

This system connects Web Push notifications to individual MySQL customer accounts, enabling:
- **Device registration per customer** - Each customer can register multiple devices (phone, tablet, desktop)
- **Targeted messaging** - Admin sends a notification to Customer #25; only their devices receive it
- **Preference control** - Customers control notification settings (quiet hours, category toggles)
- **Delivery tracking** - Full audit log of all sent, failed, queued notifications

---

## Database Schema

### `push_subscriptions`
Stores each device's push subscription (endpoint + encryption keys)

```sql
- id (PK)
- customer_id (FK → customers)
- endpoint (unique)
- auth_key, p256dh_key (encryption)
- browser_name (Chrome, Firefox, Safari)
- device_type (mobile, desktop)
- is_active
- created_at, last_used_at
```

### `notification_log`
Audit trail of every notification attempt

```sql
- id (PK)
- customer_id, subscription_id (FKs)
- title, body, image_url, click_action
- notification_type (announcement, bet_update, admin_message, etc.)
- send_status (pending, sent, failed, expired)
- sent_at, error_message
- admin_id (who sent it)
- created_at
```

### `notification_preferences`
Customer's opt-in settings

```sql
- customer_id (FK)
- push_enabled (master toggle)
- announcements, bet_updates, match_alerts, promotional (per-type toggles)
- quiet_hours_enabled, quiet_start, quiet_end (time-based mute)
```

### `notification_queue`
Campaign tracking for bulk/scheduled sends

```sql
- id (PK)
- campaign_name, target_type (single, segment, broadcast)
- title, body
- target_customer_id (if single) or segment_criteria (JSON)
- scheduled_for, processed_at
- total_recipients, successful_sends, failed_sends
- admin_id, status (draft, scheduled, processing, completed)
```

---

## Customer Endpoints

### 1. Subscribe Device to Push Notifications

**Endpoint:** `POST /api/push/subscribe`

**Auth:** Required (customer logged in)

**Request:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "auth": "base64string",
      "p256dh": "base64string"
    }
  }
}
```

**Response:**
```json
{
  "message": "Device subscribed successfully",
  "subscriptionId": 42,
  "browserName": "Chrome",
  "deviceType": "mobile"
}
```

**Error (409):** Device already subscribed - returns existing subscription ID

---

### 2. Unsubscribe Device

**Endpoint:** `POST /api/push/unsubscribe`

**Auth:** Required

**Request:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Response:**
```json
{
  "message": "Device unsubscribed"
}
```

---

### 3. List My Devices

**Endpoint:** `GET /api/push/my-devices`

**Auth:** Required

**Response:**
```json
{
  "devices": [
    {
      "id": 1,
      "browser_name": "Chrome",
      "device_type": "mobile",
      "created_at": "2026-10-06T10:30:00Z",
      "last_used_at": "2026-10-06T14:20:00Z"
    },
    {
      "id": 2,
      "browser_name": "Safari",
      "device_type": "desktop",
      "created_at": "2026-10-05T09:15:00Z",
      "last_used_at": "2026-10-06T12:00:00Z"
    }
  ],
  "count": 2
}
```

---

### 4. Get Notification Preferences

**Endpoint:** `GET /api/push/preferences`

**Auth:** Required

**Response:**
```json
{
  "id": 5,
  "customer_id": 25,
  "push_enabled": true,
  "announcements": true,
  "bet_updates": true,
  "match_alerts": true,
  "promotional": false,
  "quiet_hours_enabled": true,
  "quiet_start": "22:00:00",
  "quiet_end": "08:00:00",
  "updated_at": "2026-10-06T10:00:00Z"
}
```

---

### 5. Update Notification Preferences

**Endpoint:** `PUT /api/push/preferences`

**Auth:** Required

**Request:**
```json
{
  "push_enabled": true,
  "announcements": true,
  "bet_updates": true,
  "match_alerts": false,
  "promotional": false,
  "quiet_hours_enabled": true,
  "quiet_start": "22:00",
  "quiet_end": "08:00"
}
```

**Response:**
```json
{
  "message": "Preferences updated"
}
```

---

### 6. Get Notification History

**Endpoint:** `GET /api/push/history?limit=20`

**Auth:** Required

**Response:**
```json
{
  "notifications": [
    {
      "id": 1001,
      "title": "Match Alert: Man United vs Liverpool",
      "body": "Match starting in 15 minutes",
      "notification_type": "match_alert",
      "send_status": "sent",
      "sent_at": "2026-10-06T14:45:00Z"
    },
    {
      "id": 1000,
      "title": "Bet Confirmed",
      "body": "Your parlay bet has been placed",
      "notification_type": "bet_update",
      "send_status": "sent",
      "sent_at": "2026-10-06T14:30:00Z"
    }
  ]
}
```

---

## Admin Endpoints

All admin endpoints require `requireAdmin` middleware (user.is_admin = true)

### 1. Send Notification to Single Customer

**Endpoint:** `POST /api/admin/notifications/send`

**Auth:** Required (admin)

**Request:**
```json
{
  "customerId": 25,
  "title": "Important Update",
  "body": "Your account has been verified",
  "image_url": "https://oddshaven.com/icons/verified.png",
  "click_action": "/account/settings",
  "type": "admin_message"
}
```

**Response:**
```json
{
  "message": "Notification sent",
  "customerId": 25,
  "result": {
    "sent": 2,
    "failed": 0,
    "failures": []
  }
}
```

**Scenario:** Customer #25 has 2 active devices (Chrome on mobile + Safari on desktop). Both receive the notification.

---

### 2. Broadcast to Multiple Customers or All

**Endpoint:** `POST /api/admin/notifications/broadcast`

**Auth:** Required (admin)

**Request - Broadcast to All:**
```json
{
  "title": "Maintenance Scheduled",
  "body": "We'll be down for 2 hours tonight at midnight",
  "campaign_name": "Maintenance Alert 2026-10-06",
  "image_url": "https://oddshaven.com/icons/maintenance.png",
  "type": "system"
}
```

**Request - Target Specific Customers:**
```json
{
  "customerIds": [5, 12, 25, 33],
  "title": "Special Offer for VIP Members",
  "body": "Extra 20% bonus on your next deposit",
  "campaign_name": "VIP Campaign Oct 2026",
  "type": "promotional"
}
```

**Response:**
```json
{
  "message": "Broadcast sent",
  "campaignId": 7,
  "result": {
    "totalRecipients": 4,
    "totalSent": 8,
    "totalFailed": 0,
    "successRate": "100%"
  }
}
```

---

### 3. Get Campaigns

**Endpoint:** `GET /api/admin/notifications/campaigns?limit=50`

**Auth:** Required (admin)

**Response:**
```json
{
  "campaigns": [
    {
      "id": 7,
      "campaign_name": "VIP Campaign Oct 2026",
      "target_type": "segment",
      "title": "Special Offer for VIP Members",
      "total_recipients": 4,
      "successful_sends": 8,
      "failed_sends": 0,
      "status": "completed",
      "created_at": "2026-10-06T15:00:00Z",
      "processed_at": "2026-10-06T15:02:00Z"
    }
  ]
}
```

---

### 4. Get Customer's Notification History

**Endpoint:** `GET /api/admin/notifications/customer/:customerId/history?limit=50`

**Auth:** Required (admin)

**Response:**
```json
{
  "logs": [
    {
      "id": 1001,
      "title": "Promotion",
      "body": "Get 20% bonus",
      "notification_type": "promotional",
      "send_status": "sent",
      "sent_at": "2026-10-06T14:45:00Z",
      "error_message": null,
      "created_at": "2026-10-06T14:45:00Z"
    },
    {
      "id": 1000,
      "title": "Match Alert",
      "body": "Arsenal vs Chelsea starting soon",
      "notification_type": "match_alert",
      "send_status": "failed",
      "sent_at": null,
      "error_message": "Subscription expired (410)",
      "created_at": "2026-10-06T14:30:00Z"
    }
  ]
}
```

---

### 5. View Customer's Registered Devices

**Endpoint:** `GET /api/admin/notifications/customer/:customerId/subscriptions`

**Auth:** Required (admin)

**Response:**
```json
{
  "subscriptions": [
    {
      "id": 42,
      "browser_name": "Chrome",
      "device_type": "mobile",
      "is_active": 1,
      "created_at": "2026-10-05T10:00:00Z",
      "last_used_at": "2026-10-06T15:30:00Z"
    },
    {
      "id": 43,
      "browser_name": "Safari",
      "device_type": "desktop",
      "is_active": 0,
      "created_at": "2026-10-04T08:00:00Z",
      "last_used_at": "2026-10-05T16:00:00Z"
    }
  ]
}
```

---

### 6. Revoke Device Subscription

**Endpoint:** `POST /api/admin/notifications/revoke`

**Auth:** Required (admin)

**Request:**
```json
{
  "subscriptionId": 43
}
```

**Response:**
```json
{
  "message": "Subscription revoked"
}
```

**Effect:** Safari device (ID 43) is deactivated and won't receive future notifications

---

### 7. Get Statistics

**Endpoint:** `GET /api/admin/notifications/stats`

**Auth:** Required (admin)

**Response:**
```json
{
  "stats": {
    "activeSubscriptions": 1247,
    "todayNotifications": 523,
    "todaySent": 521,
    "todayFailed": 2,
    "topTypes": [
      { "notification_type": "match_alert", "count": 312 },
      { "notification_type": "bet_update", "count": 145 },
      { "notification_type": "announcement", "count": 64 }
    ]
  }
}
```

---

## Integration Examples

### Example 1: Admin Sends Message to Specific Customer

```javascript
// Admin interface
const response = await fetch('/api/admin/notifications/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({
    customerId: 25,
    title: 'Account Verified',
    body: 'Your identity has been confirmed',
    type: 'admin_message'
  })
});

const result = await response.json();
console.log(`Sent to ${result.result.sent} devices, ${result.result.failed} failed`);
```

**Result:** Customer #25's 2 active devices both receive the notification immediately.

---

### Example 2: Customer Subscribes Their Phone

```javascript
// On customer's phone
const notificationManager = new NotificationManager();
const result = await notificationManager.requestNotificationPermission();

if (result.success) {
  console.log('Phone subscribed:', result.subscriptionId);
  // Now this phone receives notifications targeting this customer
}
```

---

### Example 3: Broadcast to VIP Segment

```javascript
// Admin sends promotional message to all VIPs
const vipCustomerIds = [5, 12, 25, 33, 45]; // VIPs

const response = await fetch('/api/admin/notifications/broadcast', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({
    customerIds: vipCustomerIds,
    title: '🎁 VIP Exclusive Offer',
    body: 'Deposit $100, get $50 bonus (VIPs only)',
    campaign_name: 'VIP Oct Promotion',
    type: 'promotional'
  })
});

const result = await response.json();
console.log(`Campaign #${result.campaignId}: Sent ${result.result.totalSent} notifications`);
```

---

### Example 4: Customer Updates Quiet Hours

```javascript
// Customer wants no notifications between 10 PM and 8 AM
const result = await notificationManager.updatePreferences({
  quiet_hours_enabled: true,
  quiet_start: '22:00',
  quiet_end: '08:00',
  push_enabled: true,
  match_alerts: false // Also turn off match alerts
});
```

**Effect:** Any admin notifications sent between 10 PM - 8 AM go to a queue and are delivered after 8 AM.

---

## Environment Variables

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=oddshaven

VAPID_PUBLIC_KEY=BAbcd1234...
VAPID_PRIVATE_KEY=xyz1234...
VAPID_SUBJECT=mailto:admin@oddshaven.com

JWT_SECRET=your_secret_key
```

---

## Error Handling

### Subscription Expired (410)
If a device's subscription endpoint returns a 410 error, the system automatically deactivates it in `push_subscriptions`.

### Quiet Hours
Notifications sent during quiet hours are logged as "pending" and won't attempt delivery until quiet hours end.

### Failed Delivery
Failed notifications include the error message for debugging (e.g., "Subscription expired", "Invalid credentials").

---

## Security Considerations

1. **Admin-only routes** use `requireAdmin` middleware
2. **Customer data isolation** - Customers only see/control their own devices
3. **Endpoint validation** - Subscriptions verified before delivery
4. **Audit logging** - Every send attempt logged with admin ID
5. **HTTPS required** - Web Push only works over HTTPS

---

## Performance Tips

1. Use `customerIds` array for segment sends instead of looping
2. Batch notifications via `notification_queue` for scheduled sends
3. Monitor `notification_log` size—archive old records quarterly
4. Inactive subscriptions automatically deactivated on failed sends

---

## Testing

```bash
# Test subscription
curl -X POST http://localhost:3000/api/push/subscribe \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{"subscription": {...}}'

# Test admin send
curl -X POST http://localhost:3000/api/admin/notifications/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"customerId": 25, "title": "Test", "body": "Test notification"}'

# Test broadcast
curl -X POST http://localhost:3000/api/admin/notifications/broadcast \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"customerIds": [5, 12], "title": "Test Broadcast", "body": "Test"}'
```

---

## Related Files

- `db/notifications-schema.sql` - Database schema
- `services/notification-service.js` - Core notification logic
- `routes/push-subscriptions.js` - Customer endpoints
- `routes/admin-notifications.js` - Admin endpoints
- `public/notification-client.js` - Client-side subscription manager
- `middleware/auth.js` - Authentication & authorization
