// RTVTK Planner Server Configuration
require('dotenv').config();

const config = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: '24h'
  },

  // Database Configuration
  database: {
    path: process.env.DATABASE_PATH || './database.sqlite'
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development'
  },

  // CORS Configuration
  // In development, allow all origins for mobile access
  // In production, use specific origins
  // CORS_ORIGIN can be a comma-separated string of domains or 'true' for all origins
  cors: {
    get origin() {
      if (process.env.CORS_ORIGIN) {
        // If CORS_ORIGIN is set, parse it
        if (process.env.CORS_ORIGIN === 'true' || process.env.CORS_ORIGIN === 'false') {
          return process.env.CORS_ORIGIN === 'true';
        }
        // Split by comma and trim each domain
        return process.env.CORS_ORIGIN.split(',').map(domain => domain.trim());
      }
      // Default behavior based on environment
      if (process.env.NODE_ENV === 'production') {
        // In production, default to empty array (no CORS) - MUST be set via env var
        console.warn('⚠️  WARNING: CORS_ORIGIN not set in production! Set CORS_ORIGIN environment variable.');
        return [];
      }
      // Development: allow all origins for mobile access
      return true;
    }
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 600 // 600 requests per 15 minutes for all environments
  },

  // Backup Configuration
  backup: {
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 14,
    time: process.env.BACKUP_TIME || '02:30'
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
