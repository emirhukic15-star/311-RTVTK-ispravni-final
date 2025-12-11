/**
 * Date formatting utilities for RTVTK Planner
 * All dates are handled in Bosna i Hercegovina timezone (UTC+2, same as Tuzla)
 */

// Bosna i Hercegovina timezone
const EU_TIMEZONE = 'Europe/Sarajevo'; // UTC+2, same as Tuzla

/**
 * Get current date in Bosna i Hercegovina timezone
 * @returns Current date in YYYY-MM-DD format
 */
export const getCurrentDateForInput = (): string => {
  const now = new Date();
  // Use Intl.DateTimeFormat for proper timezone conversion
  const bhTimeString = new Intl.DateTimeFormat('en-CA', {
    timeZone: EU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return bhTimeString; // Already in YYYY-MM-DD format
};

/**
 * Get current datetime in Bosna i Hercegovina timezone
 * @returns Current datetime in YYYY-MM-DD HH:MM:SS format
 */
export const getCurrentDateTime = (): string => {
  const now = new Date();
  // Use Intl.DateTimeFormat for proper timezone conversion
  const bhDateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: EU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  const bhTimeString = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);
  
  return `${bhDateString} ${bhTimeString}`;
};

/**
 * Format date for display
 * @param date - Date string or Date object
 * @returns Formatted date string (DD.MM.YYYY)
 */
export const formatDate = (date: string | Date): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Use Intl.DateTimeFormat for proper timezone conversion
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    day: '2-digit'
  }).format(dateObj);
  
  const month = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    month: '2-digit'
  }).format(dateObj);
  
  const year = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    year: 'numeric'
  }).format(dateObj);
  
  return `${day}.${month}.${year}`;
};

/**
 * Format date and time for display
 * @param date - Date string or Date object
 * @returns Formatted datetime string (DD.MM.YYYY HH:MM)
 */
export const formatDateTime = (date: string | Date): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Use Intl.DateTimeFormat for proper timezone conversion
  const dateString = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(dateObj);
  
  const timeString = new Intl.DateTimeFormat('en-GB', {
    timeZone: EU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(dateObj);
  
  return `${dateString.split('/').reverse().join('.')} ${timeString}`;
};

/**
 * Format date for HTML input (date type)
 * @param date - Date string or Date object
 * @returns Date string in YYYY-MM-DD format
 */
export const formatDateForInput = (date: string | Date): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Use Intl.DateTimeFormat for proper timezone conversion
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
};

/**
 * Format date range for display
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Formatted date range string
 */
export const formatDateRange = (startDate: string | Date, endDate: string | Date): string => {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  
  if (start === end) {
    return start;
  }
  
  return `${start} - ${end}`;
};

/**
 * Format weekday and date for display
 * @param date - Date string or Date object
 * @returns Formatted string with weekday and date
 */
export const formatWeekdayDate = (date: string | Date): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Use Intl.DateTimeFormat for proper timezone conversion
  const dayOfWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: EU_TIMEZONE,
    weekday: 'long'
  }).format(dateObj);
  
  const weekdays = {
    'Sunday': 'Nedjelja',
    'Monday': 'Ponedjeljak',
    'Tuesday': 'Utorak',
    'Wednesday': 'Srijeda',
    'Thursday': 'Četvrtak',
    'Friday': 'Petak',
    'Saturday': 'Subota'
  };
  
  const weekday = weekdays[dayOfWeek as keyof typeof weekdays] || dayOfWeek;
  const formattedDate = formatDate(date);
  
  return `${weekday}, ${formattedDate}`;
};

/**
 * Normalize date for database storage
 * Ensures date is in correct format for database queries
 * @param dateString - Date string in various formats
 * @returns Normalized date string in YYYY-MM-DD format
 */
export const normalizeDateForDB = (dateString: string): string => {
  if (!dateString) return '';
  
  // If already in correct format, return as-is
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(dateString)) {
    return dateString;
  }
  
  // Try to parse and normalize
  try {
    const date = new Date(dateString);
    // Use Intl.DateTimeFormat for proper timezone conversion
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: EU_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (error) {
    console.error('Error normalizing date:', error);
    return '';
  }
};

/**
 * Add days to a date
 * @param date - Base date
 * @param days - Number of days to add (can be negative)
 * @returns New date with days added
 */
export const addDays = (date: string | Date, days: number): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Create a new date in BH timezone and add days
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: EU_TIMEZONE,
    year: 'numeric'
  }).format(dateObj);
  
  const month = new Intl.DateTimeFormat('en-US', {
    timeZone: EU_TIMEZONE,
    month: '2-digit'
  }).format(dateObj);
  
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: EU_TIMEZONE,
    day: '2-digit'
  }).format(dateObj);
  
  const bhDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  bhDate.setDate(bhDate.getDate() + days);
  
  return bhDate;
};

/**
 * Get start of week (Monday) for a given date
 * @param date - Date to get week start for
 * @returns Start of week date
 */
export const getWeekStart = (date: string | Date): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Get day of week in BH timezone
  const dayOfWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: EU_TIMEZONE,
    weekday: 'long'
  }).format(dateObj);
  
  // Convert to numeric (0 = Sunday, 1 = Monday, etc.)
  const weekdays = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6
  };
  
  const day = weekdays[dayOfWeek as keyof typeof weekdays] || 0;
  
  // Calculate days to subtract to get to Monday
  const daysToMonday = day === 0 ? 6 : day - 1;
  
  return addDays(dateObj, -daysToMonday);
};

/**
 * Get end of week (Sunday) for a given date
 * @param date - Date to get week end for
 * @returns End of week date
 */
export const getWeekEnd = (date: string | Date): Date => {
  const weekStart = getWeekStart(date);
  return addDays(weekStart, 6);
};

/**
 * Check if date is today
 * @param date - Date to check
 * @returns True if date is today
 */
export const isToday = (date: string | Date): boolean => {
  const today = getCurrentDateForInput();
  const checkDate = formatDateForInput(date);
  
  return today === checkDate;
};

/**
 * Check if date is in the past
 * @param date - Date to check
 * @returns True if date is in the past
 */
export const isPastDate = (date: string | Date): boolean => {
  const today = getCurrentDateForInput();
  const checkDate = formatDateForInput(date);
  
  return checkDate < today;
};

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 * @param date - Date to compare
 * @returns Relative time string
 */
export const getRelativeTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  
  // Calculate difference in milliseconds
  const diffMs = dateObj.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) {
    return 'upravo sada';
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'prije 1 minute' : `prije ${diffMinutes} minuta`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? 'prije 1 sata' : `prije ${diffHours} sati`;
  } else if (diffDays === 1) {
    return 'jučer';
  } else if (diffDays === -1) {
    return 'sutra';
  } else if (diffDays > 1) {
    return `prije ${diffDays} dana`;
  } else if (diffDays < -1) {
    return `za ${Math.abs(diffDays)} dana`;
  }
  
  return formatDate(date);
};
