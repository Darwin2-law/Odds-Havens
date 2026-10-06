const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from session or Authorization header
 */
function authenticateToken(req, res, next) {
  // Check session first
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId };
    return next();
  }

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Optional auth - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  } else if (req.session && req.session.userId) {
    req.user = { id: req.session.userId };
  }

  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth
};
