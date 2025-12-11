// Audit logging service

/**
 * Audit logging helper function
 * @param {Database} db - Database instance
 * @param {number} userId - User ID performing the action
 * @param {string} action - Action description
 * @param {string} tableName - Table name affected
 * @param {number} recordId - Record ID affected
 * @param {Object|null} oldData - Old data (before update)
 * @param {Object|null} newData - New data (after update)
 * @param {string|null} description - Additional description
 * @param {string|null} ipAddress - IP address of the request
 * @param {string|null} userAgent - User agent of the request
 */
const logAudit = (db, userId, action, tableName, recordId, oldData = null, newData = null, description = null, ipAddress = null, userAgent = null) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data, description, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId,
      action,
      tableName,
      recordId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      description,
      ipAddress,
      userAgent,
      new Date().toISOString()
    );
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw error, just log it - we don't want to fail operations because of audit logging
  }
};

module.exports = {
  logAudit
};

