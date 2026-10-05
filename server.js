const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
  }

  get(sessionId, callback) {
    this.db.get(
      'SELECT session_data, expires_at FROM sessions WHERE session_id = ?',
      [sessionId],
      (err, row) => {
        if (err) return callback(err);
        if (!row) return callback(null, null);
        if (row.expires_at <= Date.now()) {
          this.destroy(sessionId, (destroyErr) => callback(destroyErr, null));
          return;
        }
        try {
          return callback(null, JSON.parse(row.session_data));
        } catch (parseErr) {
          return callback(parseErr);
        }
      }
    );
  }

  set(sessionId, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + (sessionData.cookie && sessionData.cookie.maxAge || 24 * 60 * 60 * 1000);

    this.db.run(
      `INSERT INTO sessions (session_id, session_data, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET session_data = excluded.session_data, expires_at = excluded.expires_at`,
      [sessionId, JSON.stringify(sessionData), cookieExpiry],
      callback
    );
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + (sessionData.cookie && sessionData.cookie.maxAge || 24 * 60 * 60 * 1000);

    this.db.run(
      'UPDATE sessions SET expires_at = ? WHERE session_id = ?',
      [cookieExpiry, sessionId],
      callback
    );
  }

  destroy(sessionId, callback = () => {}) {
    this.db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId], callback);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.use(session({
  secret: 'odds-haven-admin-secret',
  store: new SqliteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        session_data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`, (sessionErr) => {
        if (sessionErr) return reject(sessionErr);
        db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()], (cleanupErr) => {
          if (cleanupErr) return reject(cleanupErr);
          db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);
        db.run(`CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`, (err2) => {
          if (err2) return reject(err2);
          db.run(`CREATE TABLE IF NOT EXISTS predictions (
            id TEXT PRIMARY KEY,
            home TEXT NOT NULL,
            away TEXT NOT NULL,
            homeCode TEXT NOT NULL,
            awayCode TEXT NOT NULL,
            league TEXT NOT NULL,
            kickoff TEXT NOT NULL,
            category TEXT NOT NULL,
            confidence INTEGER NOT NULL,
            risk TEXT NOT NULL,
            status TEXT NOT NULL,
            selection TEXT,
            bundleId TEXT,
            bundlePrice INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err3) => {
            if (err3) return reject(err3);
            db.all('PRAGMA table_info(predictions)', (predictionColumnsErr, predictionColumns) => {
              if (predictionColumnsErr) return reject(predictionColumnsErr);
              const predictionColumnNames = predictionColumns.map((column) => column.name);
              const addBundleColumns = (callback) => {
                const missingColumns = [];
                if (!predictionColumnNames.includes('bundleId')) missingColumns.push('ALTER TABLE predictions ADD COLUMN bundleId TEXT');
                if (!predictionColumnNames.includes('bundlePrice')) missingColumns.push('ALTER TABLE predictions ADD COLUMN bundlePrice INTEGER');
                const addNextColumn = () => {
                  const sql = missingColumns.shift();
                  if (!sql) return callback();
                  db.run(sql, (columnErr) => {
                    if (columnErr) return callback(columnErr);
                    addNextColumn();
                  });
                };
                addNextColumn();
              };
              addBundleColumns((bundleColumnsErr) => {
                if (bundleColumnsErr) return reject(bundleColumnsErr);
                db.run(`CREATE TABLE IF NOT EXISTS tipsters (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              display_name TEXT NOT NULL,
              specialty TEXT NOT NULL,
              bio TEXT NOT NULL DEFAULT '',
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err4) => {
              if (err4) return reject(err4);
              db.run(`CREATE TABLE IF NOT EXISTS admin_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                read_at DATETIME
              )`, (err5) => {
                if (err5) return reject(err5);
                db.run(`CREATE TABLE IF NOT EXISTS admin_message_replies (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  message_id INTEGER NOT NULL REFERENCES admin_messages(id) ON DELETE CASCADE,
                  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                  reply TEXT NOT NULL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err6) => {
                  if (err6) return reject(err6);
                  db.all('PRAGMA table_info(admin_message_replies)', (columnsErr, columns) => {
                    if (columnsErr) return reject(columnsErr);
                    const ensureReplyReadColumn = (callback) => {
                      if (columns.some((column) => column.name === 'read_at')) return callback();
                      db.run('ALTER TABLE admin_message_replies ADD COLUMN read_at DATETIME', callback);
                    };
                    ensureReplyReadColumn((migrationErr) => {
                      if (migrationErr) return reject(migrationErr);
                      db.run(`CREATE TABLE IF NOT EXISTS admin_notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                      )`, (err7) => {
                        if (err7) return reject(err7);
                        resolve();
                      });
                    });
                  });
                  });
                });
              });
            });
          });
            });
          });
        });
      });
    });
  });
  });
}

async function seedAdmin() {
  const user = 'admin';
  const password = '262626';
  const hash = await bcrypt.hash(password, 10);

  await new Promise((resolve, reject) => {
    db.get('SELECT id, password_hash FROM users WHERE username = ?', [user], async (err, row) => {
      if (err) {
        console.error('Admin seed lookup failed:', err.message);
        reject(err);
        return;
      }

      if (!row) {
        db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [user, hash, 'admin'], (insertErr) => {
          if (insertErr) {
            console.error('Admin seed insert failed:', insertErr.message);
            reject(insertErr);
            return;
          }
          console.log('Seeded the default admin account.');
          resolve();
        });
        return;
      }

      const currentHash = typeof row.password_hash === 'string' ? row.password_hash.trim() : '';
      const isValidHash = /^\$2[aby]\$/.test(currentHash);
      const matchesDefaultPassword = currentHash ? await bcrypt.compare(password, currentHash).catch(() => false) : false;

      if (!currentHash || !isValidHash) {
        db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, user], (updateErr) => {
          if (updateErr) {
            console.error('Admin password reset failed:', updateErr.message);
            reject(updateErr);
            return;
          }
          console.log('Reset the admin password because its stored hash was invalid.');
          resolve();
        });
        return;
      }

      if (matchesDefaultPassword) {
        console.log('Admin account is using its initial password.');
      } else {
        console.log('Custom admin password detected; leaving it unchanged.');
      }

      resolve();
    });
  });
}

function requiresAdmin(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  return next();
}

function requiresGuest(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.session.user.role !== 'guest') return res.status(403).json({ error: 'Guest account required.' });
  return next();
}

function createUserSession(req, user, res) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not create a secure session.' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: 'Could not save your session.' });
      return res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
    });
  });
}

app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: { id: req.session.user.id, username: req.session.user.username, role: req.session.user.role } });
  }
  return res.json({ authenticated: false });
});

function loginWithRole(req, res, requiredRole) {
  const username = String(req.body && req.body.username || '').trim();
  const password = String(req.body && req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({ error: 'This account cannot use that login.' });
    }

    try {
      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) return res.status(401).json({ error: 'Invalid username or password.' });
      return createUserSession(req, user, res);
    } catch (compareErr) {
      console.error('Login password verification failed:', compareErr.message);
      return res.status(500).json({ error: 'Could not verify login credentials.' });
    }
  });
}

app.post('/api/login', (req, res) => loginWithRole(req, res));
app.post('/api/admin/login', (req, res) => loginWithRole(req, res, 'admin'));
app.post('/api/guest/login', (req, res) => loginWithRole(req, res, 'guest'));

app.post('/api/register-guest', async (req, res) => {
  const username = String(req.body && req.body.username || '').trim();
  const password = String(req.body && req.body.password || '');
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, passwordHash, 'guest'], function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'That username is already in use.' });
        console.error('Guest registration failed:', err.message);
        return res.status(500).json({ error: 'Could not create your account.' });
      }
      return createUserSession(req, { id: this.lastID, username, role: 'guest' }, res);
    });
  } catch (hashErr) {
    console.error('Guest password hashing failed:', hashErr.message);
    return res.status(500).json({ error: 'Could not create your account.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  });
});

app.post('/api/change-password', requiresAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const current = String(currentPassword || '').trim();
  const next = String(newPassword || '').trim();

  if (!current || !next) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }

  if (next.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  db.get('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id], async (err, row) => {
    if (err || !row) {
      return res.status(500).json({ error: 'Unable to validate current password.' });
    }

    const matches = await bcrypt.compare(current, row.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(next, 10);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.session.user.id], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: 'Could not update password.' });
      }
      return res.json({ ok: true, message: 'Password updated successfully.' });
    });
  });
});

app.post('/api/change-username', requiresAdmin, (req, res) => {
  const username = String(req.body && req.body.username || '').trim();
  const currentPassword = String(req.body && req.body.currentPassword || '');

  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.' });
  }
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required.' });
  }

  db.get('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id], async (err, row) => {
    if (err || !row) {
      return res.status(500).json({ error: 'Unable to validate current password.' });
    }

    const matches = await bcrypt.compare(currentPassword, row.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    db.run('UPDATE users SET username = ? WHERE id = ?', [username, req.session.user.id], function (updateErr) {
      if (updateErr) {
        if (updateErr.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ error: 'That username is already in use.' });
        }
        return res.status(500).json({ error: 'Could not update username.' });
      }

      req.session.user.username = username;
      req.session.save((sessionErr) => {
        if (sessionErr) {
          return res.status(500).json({ error: 'Username changed, but the session could not be updated. Please log in again.' });
        }
        return res.json({ ok: true, username });
      });
    });
  });
});

app.get('/api/admin-state', requiresAdmin, (req, res) => {
  const state = {
    riskPrices: { Low: 500, Medium: 750, High: 1000 },
    featurePrices: {},
    announcement: null,
    predictions: []
  };

  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Unable to load settings.' });
    rows.forEach((row) => {
      try {
        const value = JSON.parse(row.value);
        if (row.key === 'riskPrices') state.riskPrices = value;
        if (row.key === 'featurePrices') state.featurePrices = value;
        if (row.key === 'announcement') state.announcement = value;
      } catch (_) {
        // ignore malformed values
      }
    });

    db.all('SELECT * FROM predictions ORDER BY created_at DESC', (predErr, predictionRows) => {
      if (predErr) return res.status(500).json({ error: 'Unable to load predictions.' });
      state.predictions = predictionRows;
      return res.json(state);
    });
  });
});

app.post('/api/admin-state', requiresAdmin, (req, res) => {
  const { riskPrices, featurePrices, announcement } = req.body || {};
  if (riskPrices && typeof riskPrices === 'object') {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['riskPrices', JSON.stringify(riskPrices)]);
  }
  if (featurePrices && typeof featurePrices === 'object') {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['featurePrices', JSON.stringify(featurePrices)]);
  }
  if (announcement !== undefined) {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['announcement', JSON.stringify(announcement)]);
  }
  return res.json({ ok: true });
});

app.get('/api/admin/overview', requiresAdmin, (req, res) => {
  db.get(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'guest') AS customerCount,
       (SELECT COUNT(*) FROM tipsters) AS tipsterCount,
       (SELECT COUNT(*) FROM predictions) AS predictionCount,
       (SELECT COUNT(*) FROM predictions WHERE status = 'Pending') AS pendingCount,
       (SELECT COUNT(*) FROM predictions WHERE status = 'Won') AS wonCount,
       (SELECT COUNT(*) FROM predictions WHERE status = 'Lost') AS lostCount,
       (SELECT COUNT(*) FROM predictions WHERE status = 'Void') AS voidCount,
       (SELECT COUNT(*) FROM admin_messages WHERE read_at IS NULL) AS unreadMessageCount,
       (SELECT COUNT(*) FROM admin_message_replies WHERE read_at IS NULL) AS unreadReplyCount,
       (SELECT MAX(created_at) FROM predictions) AS lastPredictionAt,
       (SELECT MAX(created_at) FROM users WHERE role = 'guest') AS lastCustomerAt`,
    (err, row) => {
      if (err) {
        console.error('Admin overview query failed:', err.message);
        return res.status(500).json({ error: 'Could not load command center overview.' });
      }
      const settledCount = row.wonCount + row.lostCount;
      return res.json({
        ...row,
        settledCount,
        winRate: settledCount ? Math.round((row.wonCount / settledCount) * 1000) / 10 : null,
        database: 'connected',
        serverTime: new Date().toISOString()
      });
    }
  );
});

app.get('/api/admin/customers', requiresAdmin, (req, res) => {
  db.all(
    `SELECT users.id, users.username, users.created_at AS createdAt,
       tipsters.display_name AS displayName, tipsters.specialty,
       COUNT(DISTINCT admin_messages.id) AS messageCount,
       MAX(admin_messages.created_at) AS lastMessageAt
     FROM users
     LEFT JOIN tipsters ON tipsters.user_id = users.id
     LEFT JOIN admin_messages ON admin_messages.sender_id = users.id
     WHERE users.role = 'guest'
     GROUP BY users.id
     ORDER BY users.created_at DESC, users.id DESC
     LIMIT 200`,
    (err, rows) => {
      if (err) {
        console.error('Admin customer list query failed:', err.message);
        return res.status(500).json({ error: 'Could not load community accounts.' });
      }
      return res.json(rows);
    }
  );
});

app.get('/api/tipsters', (req, res) => {
  db.all(
    `SELECT tipsters.id, tipsters.user_id AS userId, tipsters.display_name AS displayName, tipsters.specialty, tipsters.bio,
      tipsters.updated_at AS updatedAt, users.username
     FROM tipsters JOIN users ON users.id = tipsters.user_id
     ORDER BY tipsters.updated_at DESC`,
    (err, rows) => {
      if (err) {
        console.error('Tipster list query failed:', err.message);
        return res.status(500).json({ error: 'Could not load tipsters.' });
      }
      return res.json(rows);
    }
  );
});

app.get('/api/notifications', (req, res) => {
  db.all(
    'SELECT id, title, body, created_at AS createdAt FROM admin_notifications ORDER BY created_at DESC, id DESC',
    (err, rows) => {
      if (err) {
        console.error('Notification list query failed:', err.message);
        return res.status(500).json({ error: 'Could not load notifications.' });
      }
      return res.json(rows);
    }
  );
});

app.post('/api/admin/notifications', requiresAdmin, (req, res) => {
  const title = String(req.body && req.body.title || '').trim();
  const body = String(req.body && req.body.body || '').trim();
  if (!title || title.length > 120) {
    return res.status(400).json({ error: 'Notification title must contain 1–120 characters.' });
  }
  if (!body || body.length > 2000) {
    return res.status(400).json({ error: 'Notification message must contain 1–2,000 characters.' });
  }
  db.run('INSERT INTO admin_notifications (title, body) VALUES (?, ?)', [title, body], function (err) {
    if (err) {
      console.error('Admin notification publish failed:', err.message);
      return res.status(500).json({ error: 'Could not publish notification.' });
    }
    return res.status(201).json({ ok: true, id: this.lastID });
  });
});

app.delete('/api/admin/notifications/:id', requiresAdmin, (req, res) => {
  db.run('DELETE FROM admin_notifications WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('Admin notification delete failed:', err.message);
      return res.status(500).json({ error: 'Could not delete notification.' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ ok: true });
  });
});

app.post('/api/tipsters', requiresGuest, (req, res) => {
  const displayName = String(req.body && req.body.displayName || '').trim();
  const specialty = String(req.body && req.body.specialty || '').trim();
  const bio = String(req.body && req.body.bio || '').trim();
  if (displayName.length < 2 || displayName.length > 60) {
    return res.status(400).json({ error: 'Display name must be between 2 and 60 characters.' });
  }
  if (specialty.length < 2 || specialty.length > 80) {
    return res.status(400).json({ error: 'Specialty must be between 2 and 80 characters.' });
  }
  if (bio.length > 500) {
    return res.status(400).json({ error: 'Tipster bio must be 500 characters or fewer.' });
  }

  db.run(
    `INSERT INTO tipsters (user_id, display_name, specialty, bio)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name = excluded.display_name,
       specialty = excluded.specialty,
       bio = excluded.bio,
       updated_at = CURRENT_TIMESTAMP`,
    [req.session.user.id, displayName, specialty, bio],
    (err) => {
      if (err) {
        console.error('Tipster profile save failed:', err.message);
        return res.status(500).json({ error: 'Could not save your tipster profile.' });
      }
      return res.json({ ok: true });
    }
  );
});

app.post('/api/messages', requiresGuest, (req, res) => {
  const message = String(req.body && req.body.message || '').trim();
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: 'Message must contain 1–2,000 characters.' });
  }
  db.run('INSERT INTO admin_messages (sender_id, message) VALUES (?, ?)', [req.session.user.id, message], function (err) {
    if (err) {
      console.error('Admin message save failed:', err.message);
      return res.status(500).json({ error: 'Could not send your message.' });
    }
    return res.status(201).json({ ok: true, id: this.lastID });
  });
});

app.get('/api/messages', requiresGuest, (req, res) => {
  db.run(
    `UPDATE admin_message_replies SET read_at = CURRENT_TIMESTAMP
     WHERE read_at IS NULL AND message_id IN (
       SELECT id FROM admin_messages WHERE sender_id = ?
     )`,
    [req.session.user.id],
    (updateErr) => {
      if (updateErr) {
        console.error('Guest reply read status update failed:', updateErr.message);
        return res.status(500).json({ error: 'Could not mark replies as read.' });
      }
      db.all(
        `SELECT admin_messages.id, admin_messages.message, admin_messages.created_at AS createdAt,
          admin_message_replies.reply, admin_message_replies.created_at AS repliedAt
         FROM admin_messages
         LEFT JOIN admin_message_replies ON admin_message_replies.message_id = admin_messages.id
         WHERE admin_messages.sender_id = ?
         ORDER BY admin_messages.created_at DESC, admin_message_replies.created_at DESC`,
        [req.session.user.id],
        (err, rows) => {
          if (err) {
            console.error('Guest message history query failed:', err.message);
            return res.status(500).json({ error: 'Could not load your messages.' });
          }
          return res.json(rows);
        }
      );
    }
  );
});

app.get('/api/messages/unread-replies', requiresGuest, (req, res) => {
  db.get(
    `SELECT COUNT(*) AS count FROM admin_message_replies
     JOIN admin_messages ON admin_messages.id = admin_message_replies.message_id
     WHERE admin_messages.sender_id = ? AND admin_message_replies.read_at IS NULL`,
    [req.session.user.id],
    (err, row) => {
      if (err) {
        console.error('Guest unread reply count failed:', err.message);
        return res.status(500).json({ error: 'Could not load reply notifications.' });
      }
      return res.json({ count: row.count });
    }
  );
});

app.get('/api/admin/messages/unread-count', requiresAdmin, (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM admin_messages WHERE read_at IS NULL', (err, row) => {
    if (err) {
      console.error('Unread admin message count failed:', err.message);
      return res.status(500).json({ error: 'Could not load notification count.' });
    }
    return res.json({ count: row.count });
  });
});

app.get('/api/admin/messages', requiresAdmin, (req, res) => {
  db.all(
    `SELECT admin_messages.id, admin_messages.message, admin_messages.created_at AS createdAt,
      users.username AS sender,
      (SELECT admin_message_replies.reply FROM admin_message_replies
       WHERE admin_message_replies.message_id = admin_messages.id
       ORDER BY admin_message_replies.created_at DESC, admin_message_replies.id DESC LIMIT 1) AS latestReply
     FROM admin_messages JOIN users ON users.id = admin_messages.sender_id
     ORDER BY admin_messages.created_at DESC, admin_messages.id DESC`,
    (err, rows) => {
      if (err) {
        console.error('Admin inbox query failed:', err.message);
        return res.status(500).json({ error: 'Could not load admin messages.' });
      }
      db.run('UPDATE admin_messages SET read_at = CURRENT_TIMESTAMP WHERE read_at IS NULL', (updateErr) => {
        if (updateErr) {
          console.error('Admin message read status update failed:', updateErr.message);
          return res.status(500).json({ error: 'Messages loaded, but read status could not be updated.' });
        }
        return res.json(rows);
      });
    }
  );
});

app.post('/api/admin/messages/:id/replies', requiresAdmin, (req, res) => {
  const messageId = Number(req.params.id);
  const reply = String(req.body && req.body.reply || '').trim();
  if (!Number.isInteger(messageId) || messageId < 1) {
    return res.status(400).json({ error: 'Invalid message ID.' });
  }
  if (!reply || reply.length > 2000) {
    return res.status(400).json({ error: 'Reply must contain 1–2,000 characters.' });
  }

  db.get('SELECT id FROM admin_messages WHERE id = ?', [messageId], (lookupErr, row) => {
    if (lookupErr) {
      console.error('Admin reply message lookup failed:', lookupErr.message);
      return res.status(500).json({ error: 'Could not verify the message.' });
    }
    if (!row) return res.status(404).json({ error: 'Message not found.' });

    db.run(
      'INSERT INTO admin_message_replies (message_id, admin_id, reply) VALUES (?, ?, ?)',
      [messageId, req.session.user.id, reply],
      function (insertErr) {
        if (insertErr) {
          console.error('Admin message reply failed:', insertErr.message);
          return res.status(500).json({ error: 'Could not send your reply.' });
        }
        return res.status(201).json({ ok: true, id: this.lastID });
      }
    );
  });
});

app.get('/api/predictions', (req, res) => {
  db.all('SELECT * FROM predictions ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Unable to load predictions.' });
    return res.json(rows);
  });
});

app.post('/api/predictions', requiresAdmin, (req, res) => {
  const pick = req.body || {};
  const validCategories = ['Daily Odds', 'VIP', 'Over/Under', 'Double Chance', 'Correct Score', 'BTTS', 'Super Odds'];
  const cleanPick = {
    id: pick.id || `pick-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    home: String(pick.home || '').trim(),
    away: String(pick.away || '').trim(),
    homeCode: String(pick.homeCode || '').trim() || String(pick.home || '').trim().split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase(),
    awayCode: String(pick.awayCode || '').trim() || String(pick.away || '').trim().split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase(),
    league: String(pick.league || '').trim(),
    kickoff: String(pick.kickoff || '').trim(),
    category: String(pick.category || 'Daily Odds'),
    confidence: Number(pick.confidence),
    risk: ['Low', 'Medium', 'High'].includes(pick.risk) ? pick.risk : 'Medium',
    status: ['Pending', 'Won', 'Lost', 'Void'].includes(pick.status) ? pick.status : 'Pending',
    selection: pick.selection ? String(pick.selection).trim() : null,
    bundleId: typeof pick.bundleId === 'string' ? pick.bundleId : null,
    bundlePrice: pick.bundlePrice !== null && pick.bundlePrice !== undefined && Number.isSafeInteger(Number(pick.bundlePrice))
      ? Number(pick.bundlePrice)
      : null
  };

  if (!cleanPick.home || !cleanPick.away || !cleanPick.league || !cleanPick.kickoff || !validCategories.includes(cleanPick.category) || !Number.isInteger(cleanPick.confidence) || cleanPick.confidence < 1 || cleanPick.confidence > 100) {
    return res.status(400).json({ error: 'Invalid prediction details.' });
  }

  db.run(`INSERT INTO predictions (id, home, away, homeCode, awayCode, league, kickoff, category, confidence, risk, status, selection, bundleId, bundlePrice)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET home = excluded.home, away = excluded.away, homeCode = excluded.homeCode, awayCode = excluded.awayCode, league = excluded.league, kickoff = excluded.kickoff, category = excluded.category, confidence = excluded.confidence, risk = excluded.risk, status = excluded.status, selection = excluded.selection, bundleId = excluded.bundleId, bundlePrice = excluded.bundlePrice`,
    [cleanPick.id, cleanPick.home, cleanPick.away, cleanPick.homeCode, cleanPick.awayCode, cleanPick.league, cleanPick.kickoff, cleanPick.category, cleanPick.confidence, cleanPick.risk, cleanPick.status, cleanPick.selection, cleanPick.bundleId, cleanPick.bundlePrice],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save prediction.' });
      }
      return res.json({ ok: true, prediction: cleanPick });
    }
  );
});

app.post('/api/predictions/batch', requiresAdmin, (req, res) => {
  const input = req.body || {};
  const matches = input.matches;
  const category = String(input.category || 'Daily Odds');
  const confidence = Number(input.confidence);
  const risk = input.risk;
  const status = input.status;
  const validCategories = ['Daily Odds', 'VIP', 'Over/Under', 'Double Chance', 'Correct Score', 'BTTS', 'Super Odds'];

  if (!Array.isArray(matches) || matches.length < 1 || matches.length > 20) {
    return res.status(400).json({ error: 'Add between 1 and 20 matches per batch.' });
  }
  if (!validCategories.includes(category)
    || !Number.isInteger(confidence) || confidence < 1 || confidence > 100
    || !['Low', 'Medium', 'High'].includes(risk)
    || !['Pending', 'Won', 'Lost', 'Void'].includes(status)) {
    return res.status(400).json({ error: 'Invalid batch prediction settings.' });
  }

  const cleanMatches = matches.map((match) => {
    const home = String(match && match.home || '').trim();
    const away = String(match && match.away || '').trim();
    const league = String(match && match.league || '').trim();
    const kickoff = String(match && match.kickoff || '').trim();
    return {
      id: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      home,
      away,
      homeCode: home.split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase(),
      awayCode: away.split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase(),
      league,
      kickoff,
      category,
      confidence,
      risk,
      status,
      selection: null
    };
  });

  if (cleanMatches.some((match) => !match.home || match.home.length > 60 || !match.away || match.away.length > 60
    || !match.league || match.league.length > 80 || !match.kickoff || match.kickoff.length > 40)) {
    return res.status(400).json({ error: 'Every match needs valid home, away, competition, and kickoff details.' });
  }

  const saveBatch = (bundleId, bundlePrice) => {
    const values = cleanMatches.map((match) => ({ ...match, bundleId, bundlePrice }));
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION');
      const insert = db.prepare(`INSERT INTO predictions
        (id, home, away, homeCode, awayCode, league, kickoff, category, confidence, risk, status, selection, bundleId, bundlePrice)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      let insertError = null;
      values.forEach((pick) => {
        insert.run(
          [pick.id, pick.home, pick.away, pick.homeCode, pick.awayCode, pick.league, pick.kickoff, pick.category,
            pick.confidence, pick.risk, pick.status, pick.selection, pick.bundleId, pick.bundlePrice],
          (err) => { if (err && !insertError) insertError = err; }
        );
      });
      insert.finalize((finalizeErr) => {
        const failure = insertError || finalizeErr;
        if (failure) {
          return db.run('ROLLBACK', (rollbackErr) => {
            console.error('Prediction batch save failed:', failure.message);
            if (rollbackErr) console.error('Prediction batch rollback failed:', rollbackErr.message);
            return res.status(500).json({ error: 'Could not save the prediction batch.' });
          });
        }
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            console.error('Prediction batch commit failed:', commitErr.message);
            return db.run('ROLLBACK', () => res.status(500).json({ error: 'Could not save the prediction batch.' }));
          }
          return res.status(201).json({ ok: true, predictions: values, bundlePrice });
        });
      });
    });
  };

  if (category !== 'Super Odds') return saveBatch(null, null);

  db.get("SELECT value FROM settings WHERE key = 'featurePrices'", (settingsErr, row) => {
    if (settingsErr) {
      console.error('Super Odds bundle price lookup failed:', settingsErr.message);
      return res.status(500).json({ error: 'Could not load the Super Odds package price.' });
    }
    let bundlePrice = 80;
    if (row) {
      try {
        const prices = JSON.parse(row.value);
        const configuredPrice = Number(prices['super-odds']);
        if (Number.isSafeInteger(configuredPrice) && configuredPrice >= 0 && configuredPrice <= 1000000) {
          bundlePrice = configuredPrice;
        }
      } catch (parseErr) {
        console.error('Stored Super Odds price is invalid:', parseErr.message);
        return res.status(500).json({ error: 'Stored Super Odds package price is invalid.' });
      }
    }
    return saveBatch(`bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, bundlePrice);
  });
});

app.delete('/api/predictions/:id', requiresAdmin, (req, res) => {
  db.run('DELETE FROM predictions WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Could not delete prediction.' });
    return res.json({ ok: true });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'haven.html'));
});

async function startServer() {
  await initDatabase();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`OddsHaven server running on http://localhost:${PORT}`);
  });
}

startServer();
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const webpush = require("web-push");

const app = express();

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// VAPID configuration
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Temporary subscription storage
let subscriptions = [];

// Home/test
app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "OddsHaven Push Notification Server",
        status: "online"
    });
});

// Get public VAPID key
app.get("/public-key", (req, res) => {
    res.json({
        publicKey: process.env.VAPID_PUBLIC_KEY
    });
});

// Subscribe customer
app.post("/subscribe", (req, res) => {

    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({
            success: false,
            message: "Invalid subscription"
        });
    }

    const exists = subscriptions.some(
        item => item.endpoint === subscription.endpoint
    );

    if (!exists) {
        subscriptions.push(subscription);
    }

    console.log(
        `Subscribers: ${subscriptions.length}`
    );

    res.status(201).json({
        success: true,
        message: "Subscription saved"
    });
});

// Send notification
app.post("/send", async (req, res) => {

    const title =
        req.body.title || "OddsHaven";

    const body =
        req.body.body ||
        "You have a new OddsHaven notification.";

    const url =
        req.body.url || "/";

    const payload = JSON.stringify({
        title,
        body,
        url,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png"
    });

    const results = [];

    for (const subscription of subscriptions) {

        try {

            await webpush.sendNotification(
                subscription,
                payload
            );

            results.push({
                success: true
            });

        } catch (error) {

            console.error(
                "Push error:",
                error.statusCode,
                error.message
            );

            results.push({
                success: false,
                error: error.message
            });
        }
    }

    res.json({
        success: true,
        sent: results.filter(
            item => item.success
        ).length,
        total: results.length,
        results
    });
});

// Start server
app.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log("       ODDSHAVEN PUSH SERVER");
    console.log("=================================");
    console.log(`Server: http://localhost:${PORT}`);
    console.log("VAPID: configured");
    console.log("Status: ONLINE");
    console.log("=================================");
    console.log("");

});