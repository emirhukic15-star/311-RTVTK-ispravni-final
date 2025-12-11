// Authentication middleware
const jwt = require('jsonwebtoken');
const config = require('../config');

// JWT Secret from config
const JWT_SECRET = config.jwt.secret;

// Warn if JWT_SECRET is default in production
if (config.server.env === 'production' && JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.warn('⚠️  WARNING: JWT_SECRET is using default value! Please set JWT_SECRET environment variable in production!');
}

/**
 * Authentication middleware - verifies JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

module.exports = {
  authenticateToken,
  JWT_SECRET
};

