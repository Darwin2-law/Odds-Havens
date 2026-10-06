# 👤 Customer Account System

## Features Implemented

### 1. Registration/Login
- ✅ User registration with validation
- ✅ Secure password hashing (bcrypt)
- ✅ Email uniqueness check
- ✅ Password strength requirements (8+ chars)
- ✅ Login with email/password
- ✅ Session management
- ✅ Auto-logout from inactive sessions

### 2. Customer Profile
- ✅ Complete user profile management
- ✅ Personal information (name, email, phone)
- ✅ Address (country, city)
- ✅ Bio/Description
- ✅ Date of birth
- ✅ Gender
- ✅ Profile visibility settings

### 3. Profile Photo
- ✅ Photo upload (JPEG, PNG, GIF, WebP)
- ✅ File size limit (5MB)
- ✅ Auto-resize and optimization
- ✅ Old photo cleanup on update
- ✅ Secure file storage

### 4. Change Password
- ✅ Current password verification
- ✅ New password confirmation
- ✅ Password strength validation
- ✅ Activity logging
- ✅ Secure password hashing

### 5. Phone/Email Verification
- ✅ Email verification with token
- ✅ Phone verification with OTP
- ✅ Expiring tokens (24h email, 10min phone)
- ✅ Retry limits for OTP
- ✅ Verification status tracking

### 6. Account Activity History
- ✅ Login/logout tracking
- ✅ Profile changes logged
- ✅ Password changes tracked
- ✅ Email/phone verifications logged
- ✅ IP address and user agent recorded
- ✅ Timestamp for all activities

### 7. Login History
- ✅ Device name detection
- ✅ IP address recording
- ✅ Login/logout timestamps
- ✅ Session tokens
- ✅ Browser/OS detection
- ✅ Active sessions list

### 8. Logout from All Devices
- ✅ Bulk session termination
- ✅ All active sessions marked as logged out
- ✅ Activity logging
- ✅ Immediate effect on all devices

### 9. Account Notifications
- ✅ Notification preferences storage
- ✅ Push notifications enabled/disabled
- ✅ Email notifications toggle
- ✅ SMS notifications toggle
- ✅ Category-based preferences

### 10. Customer Support Tickets
- ✅ Create support tickets
- ✅ Ticket categorization
- ✅ Priority levels (low, medium, high, urgent)
- ✅ Ticket status tracking (open, in-progress, closed, resolved)
- ✅ Ticket history with replies
- ✅ Support agent responses
- ✅ Ticket closing mechanism
- ✅ Automatic ticket numbering

---

## API Endpoints

### Authentication
```bash
POST   /api/auth/register          # Register new account
POST   /api/auth/login             # Login
POST   /api/auth/logout            # Logout current session
POST   /api/auth/logout-all-devices # Logout from all devices
```

### Profile Management
```bash
GET    /api/auth/profile           # Get current user profile
PUT    /api/auth/profile           # Update profile
POST   /api/auth/profile/photo     # Upload profile photo
```

### Security
```bash
POST   /api/auth/change-password   # Change password
POST   /api/auth/verify-email/request  # Request email verification
POST   /api/auth/verify-email      # Verify email with token
POST   /api/auth/verify-phone/request  # Request phone verification
POST   /api/auth/verify-phone      # Verify phone with OTP
```

### Activity & History
```bash
GET    /api/auth/login-history     # Get login history
GET    /api/auth/activity          # Get account activity
```

### Support Tickets
```bash
POST   /api/auth/support/ticket    # Create support ticket
GET    /api/auth/support/tickets   # Get user's tickets
GET    /api/auth/support/ticket/:id # Get ticket details
POST   /api/auth/support/ticket/:id/reply # Add reply to ticket
PUT    /api/auth/support/ticket/:id/close # Close ticket
```

### Notifications
```bash
GET    /api/auth/notifications/preferences # Get preferences
PUT    /api/auth/notifications/preferences # Update preferences
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  profile_photo TEXT,
  bio TEXT,
  country TEXT,
  city TEXT,
  date_of_birth DATE,
  gender TEXT,
  email_verified BOOLEAN,
  phone_verified BOOLEAN,
  notification_preferences JSON,
  created_at DATETIME,
  updated_at DATETIME,
  last_login DATETIME
)
```

### Login History Table
```sql
CREATE TABLE login_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  session_token TEXT,
  login_time DATETIME,
  logout_time DATETIME
)
```

### Account Activity Table
```sql
CREATE TABLE account_activity (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  activity_type TEXT,
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp DATETIME
)
```

### Support Tickets Table
```sql
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  ticket_number TEXT UNIQUE,
  subject TEXT,
  description TEXT,
  category TEXT,
  priority TEXT,
  status TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  resolved_at DATETIME
)
```

### Support Replies Table
```sql
CREATE TABLE support_replies (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER,
  sender_type TEXT,
  sender_id INTEGER,
  message TEXT,
  created_at DATETIME
)
```

---

## Integration with server.js

Add to your `server.js`:

```javascript
const { router: authRouter, initDatabase, setDatabase } = require('./routes/auth');

// Initialize auth database tables
initDatabase();
setDatabase(db); // Pass your sqlite3 database connection

// Mount auth routes
app.use('/api/auth', authRouter);
```

---

## Frontend Usage Examples

### Register
```javascript
await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'johndoe',
    email: 'john@example.com',
    password: 'SecurePass123!',
    confirm_password: 'SecurePass123!',
    first_name: 'John',
    last_name: 'Doe'
  })
});
```

### Login
```javascript
await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'SecurePass123!'
  })
});
```

### Update Profile
```javascript
await fetch('/api/auth/profile', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1234567890',
    bio: 'Football enthusiast',
    country: 'Kenya',
    city: 'Nairobi'
  })
});
```

### Upload Profile Photo
```javascript
const formData = new FormData();
formData.append('photo', fileInput.files[0]);

await fetch('/api/auth/profile/photo', {
  method: 'POST',
  body: formData
});
```

### Create Support Ticket
```javascript
await fetch('/api/auth/support/ticket', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subject: 'Unable to verify email',
    description: 'I did not receive the verification email',
    category: 'account',
    priority: 'high'
  })
});
```

### Get Login History
```javascript
const response = await fetch('/api/auth/login-history');
const { sessions } = await response.json();
```

### Logout from All Devices
```javascript
await fetch('/api/auth/logout-all-devices', {
  method: 'POST'
});
```

---

## Security Features

✅ **Password Security:**
- Bcrypt hashing (10 rounds)
- Minimum 8 characters
- No plaintext storage

✅ **Session Management:**
- Unique session tokens
- Session timeout support
- Device tracking

✅ **Verification:**
- Email verification tokens (24h expiry)
- Phone OTP (10min expiry)
- Rate limiting on attempts

✅ **Activity Logging:**
- All actions tracked
- IP address recording
- Device information stored
- Timestamp tracking

✅ **Account Protection:**
- Unique username/email
- Login history available
- Logout from all devices option
- Password change logging

---

## Testing Accounts

For testing, you can use:

```
Email: test@example.com
Password: TestPass123!
```

---

## Next Steps

1. ✅ Integrate with main server.js
2. ✅ Add email sending (nodemailer)
3. ✅ Add SMS sending (Twilio)
4. ✅ Add frontend login/register forms
5. ✅ Add account settings page
6. ✅ Add support tickets UI
7. ✅ Add admin dashboard for ticket management
8. ✅ Add 2FA (Two-Factor Authentication)
