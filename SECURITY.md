# OddsHaven Security Guidelines

## Authentication Overview

OddsHaven implements a complete authentication and authorization system with the following features:

### 1. User Roles
- **Admin**: Full platform access (predictions, settings, customer management)
- **Guest**: Community member access (tipster profiles, predictions, messaging)

### 2. Password Security
- Passwords hashed with bcryptjs (10 rounds by default)
- Minimum 8 characters, maximum 128 characters
- Passwords salted and never stored in plain text
- Password changes require verification of current password

### 3. Session Management
- Sessions stored in SQLite database
- Session timeout: 30 days (configurable via `SESSION_MAX_AGE`)
- Rolling sessions refresh on each request
- HTTP-only cookies prevent XSS attacks
- SameSite=Lax prevents CSRF attacks

### 4. Login Methods
- `/api/login` - General login (supports both roles)
- `/api/admin/login` - Admin-only login
- `/api/guest/login` - Guest-only login
- All logins require username + password

### 5. Protected Endpoints
Admin-protected endpoints (require admin role):
- `/api/admin-state` - Read/write platform settings
- `/api/admin/messages` - View and reply to customer messages
- `/api/admin/notifications` - Publish system notifications
- `/api/predictions` - Create/update predictions
- `/api/change-password` - Admin password management
- `/api/change-username` - Admin username management

Guest-protected endpoints (require guest role):
- `/api/tipsters` - Create/update tipster profile
- `/api/messages` - Send messages to admin
- `/api/messages/unread-replies` - Check message replies

### 6. Session Endpoints
- `GET /api/session` - Check current session status
- `POST /api/logout` - Destroy session and clear cookies

---

## Default Credentials

> ⚠️ **IMPORTANT**: Change these immediately in production!

**Default Admin Account:**
- Username: `admin`
- Password: `262626`

Configure via environment variables:
```bash
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=your-secure-password
```

The admin account is auto-seeded on first server startup. Existing credentials are preserved if already set.

---

## Setting Up Authentication

### 1. Environment Configuration
Copy `.env.example` to `.env` and configure:
```bash
SESSION_SECRET=your-secure-random-string-here
NODE_ENV=production
ADMIN_DEFAULT_PASSWORD=your-very-secure-password
BCRYPT_ROUNDS=12  # Higher for production
```

### 2. Database Initialization
The database is automatically initialized on startup with all necessary tables:
- `users` - Store user accounts and password hashes
- `sessions` - Store active session data
- `tipsters` - Tipster profiles
- `admin_messages` - Customer-to-admin messaging
- `admin_message_replies` - Admin replies to customers
- `predictions` - Football match predictions

### 3. Admin Account Setup
On first startup, the default admin account is created:
```javascript
// Auto-seeded in seedAdmin() function
// Username: admin
// Password: 262626 (bcrypt hashed)
```

To change the admin password:
1. Log in to admin panel
2. Click user avatar → Change password
3. Verify current password and set new one

---

## Best Practices

### For Development
- Use the included default credentials
- Keep `NODE_ENV=development`
- Store `database.sqlite` in `.gitignore`
- Use `SESSION_SECRET=dev-secret-123` for testing

### For Production
- ✅ Change `SESSION_SECRET` to a cryptographically secure random string
- ✅ Change default admin password immediately
- ✅ Set `NODE_ENV=production` (enables secure cookies)
- ✅ Use `BCRYPT_ROUNDS=12` or higher
- ✅ Enable HTTPS/SSL (required for secure cookies)
- ✅ Store `.env` securely (never commit to repo)
- ✅ Regular database backups
- ✅ Monitor login attempts and unusual activity
- ✅ Implement rate limiting for login endpoints
- ✅ Use strong, unique passwords (20+ characters recommended)

### Login Validation
- Usernames: 3-32 characters, alphanumeric + `.`, `_`, `-`
- Passwords: 8-128 characters (case-sensitive)
- Username uniqueness enforced at database level
- Failed login attempts return generic error messages

---

## API Examples

### Admin Login
```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"262626"}'
```

Response:
```json
{
  "ok": true,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### Guest Registration
```bash
curl -X POST http://localhost:3000/api/register-guest \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","password":"SecurePass123"}'
```

### Check Session Status
```bash
curl http://localhost:3000/api/session
```

### Logout
```bash
curl -X POST http://localhost:3000/api/logout
```

---

## Troubleshooting

### "Invalid username or password"
- Verify username spelling (case-sensitive)
- Ensure password is correct (case-sensitive)
- Check if account exists: try guest registration

### "Admin access required"
- Ensure logged in with admin account
- Check `/api/session` to verify role
- Try logging out and logging back in

### Session Not Persisting
- Check browser cookies are enabled
- Verify `SESSION_SECRET` is set consistently
- Check database.sqlite exists and is readable
- Try clearing cookies and logging in again

### Database Locked Errors
- Ensure only one server instance is running
- Check file permissions on `database.sqlite`
- Close any other database connections
- Restart the server

---

## Security Checklist

- [ ] Changed default admin password
- [ ] Set unique `SESSION_SECRET`
- [ ] Configured proper `NODE_ENV` (production/development)
- [ ] Set secure cookie flags in production
- [ ] Implemented HTTPS/SSL
- [ ] Regular database backups
- [ ] Monitor suspicious login patterns
- [ ] Keep dependencies updated
- [ ] Review and audit database access
- [ ] Implement rate limiting (optional but recommended)

---

## Additional Resources

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [bcryptjs Documentation](https://github.com/dcodeIO/bcrypt.js)
- [Express Session Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
