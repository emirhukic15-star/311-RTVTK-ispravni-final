// Helper utility functions

/**
 * Convert date to Bosna i Hercegovina timezone for database queries
 * Time zone: UTC+2 (CEST), same as Tuzla
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Date string adjusted for BH timezone
 */
const normalizeDateForQuery = (dateString) => {
  // For date-only queries, we want to ensure we're working with the correct date
  // in the Bosna i Hercegovina timezone context (UTC+2, same as Tuzla)
  if (!dateString) return dateString;
  
  // For date-only fields, we should store them as-is without timezone conversion
  // since we're dealing with dates, not timestamps
  // Just validate the format and return as-is
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(dateString)) {
    return dateString;
  }
  
  // If not in correct format, try to parse and return
  const [year, month, day] = dateString.split('-').map(Number);
  if (year && month && day) {
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  
  return dateString;
};

const generateEmailFromName = (name) => {
  if (!name) return null;
  
  // Convert to lowercase and replace spaces with dots
  // Convert Bosnian characters to standard ASCII
  const cleanName = name
    .toLowerCase()
    .trim()
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dz')
    .replace(/\s+/g, '.') // Replace spaces with dots
    .replace(/[^a-z0-9.]/g, '') // Remove special characters except dots
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/^\.|\.$/g, ''); // Remove leading/trailing dots
  
  if (!cleanName) return null;
  
  return `${cleanName}@rtvtk.ba`;
};

const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  
  // If empty after cleaning, return null
  if (!cleanPhone) return null;
  
  // If it already starts with 387, just add +
  if (cleanPhone.startsWith('387')) {
    return `+${cleanPhone}`;
  }
  
  // If it starts with 0, replace with 387
  if (cleanPhone.startsWith('0')) {
    return `+387${cleanPhone.substring(1)}`;
  }
  
  // If it's a local number (starts with 6 or 5), add 387
  if (cleanPhone.startsWith('6') || cleanPhone.startsWith('5')) {
    return `+387${cleanPhone}`;
  }
  
  // For any other case, assume it needs 387 prefix
  return `+387${cleanPhone}`;
};

// Bosna i Hercegovina timezone utilities
// Time zone: UTC+2 (Central European Summer Time - CEST)
// Always same time as Tuzla
const EU_TIMEZONE = 'Europe/Sarajevo'; // UTC+2, same as Tuzla

/**
 * Get current date in Bosna i Hercegovina timezone
 * Time zone: UTC+2 (CEST), same as Tuzla
 * @returns {string} Current date in YYYY-MM-DD format
 */
const getCurrentDateInBH = () => {
  const now = new Date();
  // Use Intl.DateTimeFormat for proper timezone conversion
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
};

/**
 * Get current datetime in Bosna i Hercegovina timezone
 * Time zone: UTC+2 (CEST), same as Tuzla
 * @returns {string} Current datetime in YYYY-MM-DD HH:MM:SS format
 */
const getCurrentDateTimeInBH = () => {
  const now = new Date();
  // Use Intl.DateTimeFormat for proper timezone conversion
  const dateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: EU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  const timeString = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);
  
  return `${dateString} ${timeString}`;
};

/**
 * Helper function to parse JSON fields in task objects
 * @param {Object} task - Task object from database
 * @returns {Object} Task object with parsed JSON fields
 */
const parseTaskJsonFields = (task) => {
  if (!task) return task;
  
  return {
    ...task,
    journalist_ids: typeof task.journalist_ids === 'string' 
      ? (task.journalist_ids ? JSON.parse(task.journalist_ids) : [])
      : (task.journalist_ids || []),
    cameraman_ids: typeof task.cameraman_ids === 'string'
      ? (task.cameraman_ids ? JSON.parse(task.cameraman_ids) : [])
      : (task.cameraman_ids || []),
    flags: typeof task.flags === 'string'
      ? (task.flags ? JSON.parse(task.flags) : [])
      : (task.flags || [])
  };
};

module.exports = {
  normalizeDateForQuery,
  generateEmailFromName,
  formatPhoneNumber,
  getCurrentDateInBH,
  getCurrentDateTimeInBH,
  parseTaskJsonFields,
  EU_TIMEZONE
};

