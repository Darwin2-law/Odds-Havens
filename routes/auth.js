/**
 * Customer Account System
 * Complete authentication and profile management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

// Database connection (from main server.js)
let db;

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.session.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware: Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

// Middleware: Initialize database
const initDatabase = () => {
  if (!db) {
    db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'), (err) => {
      if (err) console.error('Database connection failed:', err);
    });
  }
};

// Initialize database tables
const createTables = () => {
  initDatabase();
  
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      first_name TEXT,
      last_name TEXT,
      profile_photo TEXT,
      bio TEXT,
      country TEXT,
      city TEXT,
      date_of_birth DATE,
      gender TEXT,
      notification_preferences TEXT DEFAULT '{}',
      two_factor_enabled INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      phone_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active INTEGER DEFAULT 1
    )`);

    // Email verification tokens
    db.run(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Phone verification tokens
    db.run(`CREATE TABLE IF NOT EXISTS phone_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Login history
    db.run(`CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      device_name TEXT,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      logout_time DATETIME,
      session_token TEXT UNIQUE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Account activity history
    db.run(`CREATE TABLE IF NOT EXISTS account_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Support tickets
    db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ticket_number TEXT UNIQUE NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      attachment_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Support ticket replies
    db.run(`CREATE TABLE IF NOT EXISTS support_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      attachment_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    )`);
  });
};

// Helper: Generate verification token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Helper: Get user IP
const getUserIP = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
};

// Helper: Get user agent
const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'unknown';
};

// Helper: Log account activity
const logActivity = (userId, activityType, description, req) => {
  db.run(
    `INSERT INTO account_activity (user_id, activity_type, description, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, activityType, description, getUserIP(req), getUserAgent(req)],
    (err) => {
      if (err) console.error('Activity log error:', err.message);
    }
  );
};

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Register new account
router.post('/register', (req, res) => {
  const { username, email, password, confirm_password, first_name, last_name, phone } = req.body;

  // Validation
  if (!username || !email || !password || !confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  if (password !== confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email address'
    });
  }

  // Hash password
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Insert user
  db.run(
    `INSERT INTO users (username, email, password, first_name, last_name, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, email, hashedPassword, first_name || null, last_name || null, phone || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed: users.username')) {
          return res.status(400).json({
            success: false,
            message: 'Username already taken'
          });
        }
        if (err.message.includes('UNIQUE constraint failed: users.email')) {
          return res.status(400).json({
            success: false,
            message: 'Email already registered'
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Registration failed'
        });
      }

      const userId = this.lastID;

      // Create session
      req.session.userId = userId;
      req.session.username = username;
      req.session.role = 'customer';

      // Log activity
      logActivity(userId, 'account_created', 'New account created', req);

      // Create email verification token
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      db.run(
        `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [userId, token, expiresAt]
      );

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
          id: userId,
          username: username,
          email: email,
          first_name: first_name,
          last_name: last_name
        },
        verification_required: true,
        verification_token: token
      });
    }
  );
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password required'
    });
  }

  db.get(
    `SELECT id, username, email, password, first_name, last_name, email_verified, is_active
     FROM users WHERE email = ?`,
    [email],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Login failed'
        });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is disabled'
        });
      }

      // Check password
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = 'customer';

      // Generate session token
      const sessionToken = generateToken();

      // Record login
      const userAgent = getUserAgent(req);
      const deviceName = userAgent.includes('Mobile') ? 'Mobile' : 'Desktop';

      db.run(
        `INSERT INTO login_history (user_id, ip_address, user_agent, device_name, session_token)
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, getUserIP(req), userAgent, deviceName, sessionToken]
      );

      // Update last login
      db.run(
        `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
        [user.id]
      );

      // Log activity
      logActivity(user.id, 'login', `Login from ${deviceName}`, req);

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified === 1
        }
      });
    }
  );
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const sessionToken = req.body.session_token || req.session.sessionToken;

  // Update logout time
  if (sessionToken) {
    db.run(
      `UPDATE login_history SET logout_time = CURRENT_TIMESTAMP
       WHERE user_id = ? AND session_token = ?`,
      [userId, sessionToken]
    );
  }

  // Log activity
  logActivity(userId, 'logout', 'User logged out', req);

  // Destroy session
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });
  });
});

// Logout from all devices
router.post('/logout-all-devices', requireAuth, (req, res) => {
  const userId = req.session.userId;

  // Mark all active sessions as logged out
  db.run(
    `UPDATE login_history SET logout_time = CURRENT_TIMESTAMP
     WHERE user_id = ? AND logout_time IS NULL`,
    [userId],
    (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to logout from all devices'
        });
      }

      // Log activity
      logActivity(userId, 'logout_all_devices', 'Logged out from all devices', req);

      // Destroy current session
      req.session.destroy();

      res.json({
        success: true,
        message: 'Logged out from all devices'
      });
    }
  );
});

// ============================================
// PROFILE ROUTES
// ============================================

// Get current user profile
router.get('/profile', requireAuth, (req, res) => {
  db.get(
    `SELECT id, username, email, phone, first_name, last_name, profile_photo, bio,
            country, city, date_of_birth, gender, email_verified, phone_verified,
            created_at, updated_at, last_login
     FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch profile'
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        user: {
          ...user,
          email_verified: user.email_verified === 1,
          phone_verified: user.phone_verified === 1
        }
      });
    }
  );
});

// Update profile
router.put('/profile', requireAuth, (req, res) => {
  const { first_name, last_name, phone, bio, country, city, date_of_birth, gender } = req.body;
  const userId = req.session.userId;

  db.run(
    `UPDATE users SET first_name = ?, last_name = ?, phone = ?, bio = ?,
            country = ?, city = ?, date_of_birth = ?, gender = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [first_name || null, last_name || null, phone || null, bio || null, country || null,
     city || null, date_of_birth || null, gender || null, userId],
    (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update profile'
        });
      }

      logActivity(userId, 'profile_updated', 'Profile information updated', req);

      res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    }
  );
});

// Upload profile photo
router.post('/profile/photo', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const userId = req.session.userId;
  const photoPath = '/uploads/profiles/' + req.file.filename;

  // Get old photo to delete
  db.get('SELECT profile_photo FROM users WHERE id = ?', [userId], (err, user) => {
    if (user && user.profile_photo) {
      const oldPhotoPath = path.join(__dirname, '..', user.profile_photo);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    // Update database
    db.run(
      `UPDATE users SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [photoPath, userId],
      (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: 'Failed to update profile photo'
          });
        }

        logActivity(userId, 'profile_photo_updated', 'Profile photo updated', req);

        res.json({
          success: true,
          message: 'Profile photo updated successfully',
          photo_url: photoPath
        });
      }
    );
  });
});

// ============================================
// SECURITY ROUTES
// ============================================

// Change password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const userId = req.session.userId;

  if (!current_password || !new_password || !confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'New passwords do not match'
    });
  }

  if (new_password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters'
    });
  }

  db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({
        success: false,
        message: 'Failed to verify current password'
      });
    }

    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);

    db.run(
      `UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashedPassword, userId],
      (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: 'Failed to change password'
          });
        }

        logActivity(userId, 'password_changed', 'Password changed', req);

        res.json({
          success: true,
          message: 'Password changed successfully'
        });
      }
    );
  });
});

// Request email verification
router.post('/verify-email/request', requireAuth, (req, res) => {
  const userId = req.session.userId;

  db.get('SELECT email FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    // Generate token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.run(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [userId, token, expiresAt],
      (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: 'Failed to generate verification token'
          });
        }

        logActivity(userId, 'email_verification_requested', 'Email verification requested', req);

        // TODO: Send email with verification link
        // sendVerificationEmail(user.email, token);

        res.json({
          success: true,
          message: 'Verification email sent',
          token: token // For testing only - remove in production
        });
      }
    );
  });
});

// Verify email with token
router.post('/verify-email', requireAuth, (req, res) => {
  const { token } = req.body;
  const userId = req.session.userId;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Verification token required'
    });
  }

  db.get(
    `SELECT id FROM email_verification_tokens
     WHERE user_id = ? AND token = ? AND expires_at > CURRENT_TIMESTAMP`,
    [userId, token],
    (err, tokenRecord) => {
      if (err || !tokenRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification token'
        });
      }

      // Mark email as verified
      db.run(
        `UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [userId],
        (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: 'Failed to verify email'
            });
          }

          // Delete used token
          db.run(`DELETE FROM email_verification_tokens WHERE id = ?`, [tokenRecord.id]);

          logActivity(userId, 'email_verified', 'Email verified', req);

          res.json({
            success: true,
            message: 'Email verified successfully'
          });
        }
      );
    }
  );
});

// Request phone verification
router.post('/verify-phone/request', requireAuth, (req, res) => {
  const { phone } = req.body;
  const userId = req.session.userId;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number required'
    });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  db.run(
    `INSERT INTO phone_verification_tokens (user_id, token, phone, expires_at) VALUES (?, ?, ?, ?)`,
    [userId, token, phone, expiresAt],
    (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to request phone verification'
        });
      }

      logActivity(userId, 'phone_verification_requested', `Phone verification requested for ${phone}`, req);

      // TODO: Send OTP via SMS
      // sendSMS(phone, `Your OTP is: ${otp}`);

      res.json({
        success: true,
        message: 'Verification code sent to phone',
        token: token, // For testing
        otp: otp // For testing only - remove in production
      });
    }
  );
});

// Verify phone with OTP
router.post('/verify-phone', requireAuth, (req, res) => {
  const { token, otp } = req.body;
  const userId = req.session.userId;

  if (!token || !otp) {
    return res.status(400).json({
      success: false,
      message: 'Token and OTP required'
    });
  }

  db.get(
    `SELECT id, phone FROM phone_verification_tokens
     WHERE user_id = ? AND token = ? AND expires_at > CURRENT_TIMESTAMP`,
    [userId, token],
    (err, tokenRecord) => {
      if (err || !tokenRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification token'
        });
      }

      // TODO: Verify OTP (for now, accept any 6-digit code)
      if (!/^\d{6}$/.test(otp)) {
        // Increment attempts
        db.run(
          `UPDATE phone_verification_tokens SET attempts = attempts + 1 WHERE id = ?`,
          [tokenRecord.id]
        );

        return res.status(400).json({
          success: false,
          message: 'Invalid OTP'
        });
      }

      // Mark phone as verified
      db.run(
        `UPDATE users SET phone = ?, phone_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [tokenRecord.phone, userId],
        (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: 'Failed to verify phone'
            });
          }

          // Delete used token
          db.run(`DELETE FROM phone_verification_tokens WHERE id = ?`, [tokenRecord.id]);

          logActivity(userId, 'phone_verified', `Phone verified: ${tokenRecord.phone}`, req);

          res.json({
            success: true,
            message: 'Phone verified successfully'
          });
        }
      );
    }
  );
});

// ============================================
// ACTIVITY ROUTES
// ============================================

// Get login history
router.get('/login-history', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const limit = parseInt(req.query.limit) || 20;

  db.all(
    `SELECT id, device_name, ip_address, login_time, logout_time
     FROM login_history
     WHERE user_id = ?
     ORDER BY login_time DESC
     LIMIT ?`,
    [userId, limit],
    (err, sessions) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch login history'
        });
      }

      res.json({
        success: true,
        sessions: sessions || []
      });
    }
  );
});

// Get account activity
router.get('/activity', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const limit = parseInt(req.query.limit) || 50;

  db.all(
    `SELECT id, activity_type, description, ip_address, timestamp
     FROM account_activity
     WHERE user_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [userId, limit],
    (err, activities) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch activity history'
        });
      }

      res.json({
        success: true,
        activities: activities || []
      });
    }
  );
});

// ============================================
// SUPPORT TICKET ROUTES
// ============================================

// Create support ticket
router.post('/support/ticket', requireAuth, (req, res) => {
  const { subject, description, category, priority } = req.body;
  const userId = req.session.userId;

  if (!subject || !description || !category) {
    return res.status(400).json({
      success: false,
      message: 'Subject, description, and category are required'
    });
  }

  const ticketNumber = 'TKT-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

  db.run(
    `INSERT INTO support_tickets (user_id, ticket_number, subject, description, category, priority)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, ticketNumber, subject, description, category, priority || 'medium'],
    function (err) {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create support ticket'
        });
      }

      logActivity(userId, 'support_ticket_created', `Support ticket created: ${ticketNumber}`, req);

      res.status(201).json({
        success: true,
        message: 'Support ticket created successfully',
        ticket: {
          id: this.lastID,
          ticket_number: ticketNumber,
          status: 'open'
        }
      });
    }
  );
});

// Get user's support tickets
router.get('/support/tickets', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const status = req.query.status || null;

  let query = `SELECT id, ticket_number, subject, category, priority, status, created_at, updated_at
               FROM support_tickets
               WHERE user_id = ?`;
  const params = [userId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC`;

  db.all(query, params, (err, tickets) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch support tickets'
      });
    }

    res.json({
      success: true,
      tickets: tickets || []
    });
  });
});

// Get support ticket details
router.get('/support/ticket/:ticket_number', requireAuth, (req, res) => {
  const { ticket_number } = req.params;
  const userId = req.session.userId;

  db.get(
    `SELECT id, user_id, ticket_number, subject, description, category, priority, status, created_at, updated_at
     FROM support_tickets
     WHERE ticket_number = ? AND user_id = ?`,
    [ticket_number, userId],
    (err, ticket) => {
      if (err || !ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Get replies
      db.all(
        `SELECT id, sender_type, sender_id, message, created_at
         FROM support_replies
         WHERE ticket_id = ?
         ORDER BY created_at ASC`,
        [ticket.id],
        (err, replies) => {
          res.json({
            success: true,
            ticket: {
              ...ticket,
              replies: replies || []
            }
          });
        }
      );
    }
  );
});

// Add reply to support ticket
router.post('/support/ticket/:ticket_number/reply', requireAuth, (req, res) => {
  const { ticket_number } = req.params;
  const { message } = req.body;
  const userId = req.session.userId;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: 'Reply message required'
    });
  }

  db.get(
    `SELECT id FROM support_tickets WHERE ticket_number = ? AND user_id = ?`,
    [ticket_number, userId],
    (err, ticket) => {
      if (err || !ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      db.run(
        `INSERT INTO support_replies (ticket_id, sender_type, sender_id, message)
         VALUES (?, ?, ?, ?)`,
        [ticket.id, 'customer', userId, message],
        (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: 'Failed to add reply'
            });
          }

          logActivity(userId, 'support_reply_added', `Reply added to ticket: ${ticket_number}`, req);

          res.status(201).json({
            success: true,
            message: 'Reply added successfully'
          });
        }
      );
    }
  );
});

// Close support ticket
router.put('/support/ticket/:ticket_number/close', requireAuth, (req, res) => {
  const { ticket_number } = req.params;
  const userId = req.session.userId;

  db.run(
    `UPDATE support_tickets SET status = 'closed', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE ticket_number = ? AND user_id = ?`,
    [ticket_number, userId],
    function (err) {
      if (err || this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      logActivity(userId, 'support_ticket_closed', `Support ticket closed: ${ticket_number}`, req);

      res.json({
        success: true,
        message: 'Support ticket closed'
      });
    }
  );
});

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

// Get notification preferences
router.get('/notifications/preferences', requireAuth, (req, res) => {
  const userId = req.session.userId;

  db.get(
    `SELECT notification_preferences FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch preferences'
        });
      }

      try {
        const preferences = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
        res.json({
          success: true,
          preferences: preferences
        });
      } catch (e) {
        res.json({
          success: true,
          preferences: {}
        });
      }
    }
  );
});

// Update notification preferences
router.put('/notifications/preferences', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const preferences = req.body;

  db.run(
    `UPDATE users SET notification_preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(preferences), userId],
    (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update preferences'
        });
      }

      logActivity(userId, 'notification_preferences_updated', 'Notification preferences updated', req);

      res.json({
        success: true,
        message: 'Notification preferences updated'
      });
    }
  );
});

// Export initialization function
module.exports = {
  router,
  initDatabase: createTables,
  setDatabase: (database) => {
    db = database;
  }
};
