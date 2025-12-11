import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AutoLogoutOptions {
  timeoutMinutes?: number;
  warningMinutes?: number;
  onLogout?: () => void;
}

export const useAutoLogout = (options: AutoLogoutOptions = {}) => {
  const { logout } = useAuth();
  const {
    timeoutMinutes = 15,
    warningMinutes = 2,
    onLogout
  } = options;

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Convert minutes to milliseconds
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = warningMinutes * 60 * 1000;

  const resetTimer = useCallback(() => {
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
    console.log('🔄 resetTimer called, isActive:', isActive);
    }
    
    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    // Reset states
    setShowWarning(false);
    setTimeLeft(null);

    // Set warning timer
    warningTimeoutRef.current = setTimeout(() => {
      // Debug logging (only in development)
      if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Warning timer triggered');
      }
      setShowWarning(true);
      setTimeLeft(warningMinutes * 60); // Start countdown in seconds

      // Start countdown
      countdownRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
            // Time's up - logout
            // Debug logging (only in development)
            if (process.env.NODE_ENV === 'development') {
            console.log('🚪 Auto logout triggered');
            }
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            logout();
            if (onLogout) {
              onLogout();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, timeoutMs - warningMs);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      // Debug logging (only in development)
      if (process.env.NODE_ENV === 'development') {
      console.log('🚪 Main logout timer triggered');
      }
      logout();
      if (onLogout) {
        onLogout();
      }
    }, timeoutMs);

  }, [timeoutMs, warningMs, logout, onLogout, warningMinutes, isActive]);

  const extendSession = useCallback(() => {
    setShowWarning(false);
    setTimeLeft(null);
    resetTimer();
    // Optional: You can add a toast notification here
    // toast.success('Sesija je produžena');
  }, [resetTimer]);

  const logoutNow = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    logout();
    if (onLogout) {
      onLogout();
    }
  }, [logout, onLogout]);

  const pauseTimer = useCallback(() => {
    setIsActive(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
  }, []);

  const resumeTimer = useCallback(() => {
    setIsActive(true);
    resetTimer();
  }, [resetTimer]);

  // Track user activity
  useEffect(() => {
    if (!isActive) return;

    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    const resetTimerOnActivity = () => {
      if (isActive) {
        resetTimer();
      }
    };

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, resetTimerOnActivity, true);
    });

    // Start the timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimerOnActivity, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isActive, resetTimer]);

  // Initialize timer when component mounts
  useEffect(() => {
    if (isActive) {
      resetTimer();
    }
  }, [isActive, resetTimer]);

  return {
    timeLeft,
    showWarning,
    isActive,
    extendSession,
    logoutNow,
    pauseTimer,
    resumeTimer
  };
};
