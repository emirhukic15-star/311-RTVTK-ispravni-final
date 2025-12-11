import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoLogout } from '../../hooks/useAutoLogout';
import Notifications from '../Notifications';
import {
  Calendar,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  Tv,
  BarChart3,
  Clock,
  Moon,
  Sun
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [timeUntilWarning, setTimeUntilWarning] = useState<number>(0);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return saved === 'true';
    }
    // Default to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const { user, logout, hasPermission, dynamicPermissions } = useAuth();
  const location = useLocation();

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };
  
  // Auto logout functionality
  const { isActive: isSessionActive, timeLeft, showWarning } = useAutoLogout({
    timeoutMinutes: 15,
    warningMinutes: 2,
  });

  // Debug logging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🕐 Layout session state:', { isSessionActive, timeLeft, showWarning, timeUntilWarning });
    }
  }, [isSessionActive, timeLeft, showWarning, timeUntilWarning]);

  // Force re-render when dynamic permissions are loaded
  useEffect(() => {
    // Dynamic permissions loaded
  }, [dynamicPermissions]);

  // Calculate and update time until warning
  useEffect(() => {
    if (!isSessionActive || showWarning) {
      setTimeUntilWarning(0);
      return;
    }

    // Start with 13 minutes (15 - 2 minutes warning)
    let remainingTime = 13 * 60; // 13 minutes in seconds
    
    setTimeUntilWarning(remainingTime);

    // Decrease time every second
    const interval = setInterval(() => {
      setTimeUntilWarning(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, showWarning]);

  // Reset timeUntilWarning when session is reset (user activity)
  useEffect(() => {
    if (isSessionActive && !showWarning) {
      setTimeUntilWarning(13 * 60); // Reset to 13 minutes
    }
  }, [isSessionActive, showWarning]);

  // Format time remaining for display
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      roles: ['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA', 'JOURNALIST']
    },
    {
      name: 'Dispozicija',
      href: '/dispozicija',
      icon: Calendar,
      roles: ['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'CAMERA']
    },
    {
      name: 'Wallboard Režija',
      href: '/wallboard-rezija',
      icon: Tv,
      roles: ['PRODUCER', 'CONTROL_ROOM'],
      permission: 'wallboard.control_room'
    },
    {
      name: 'Uposlenici',
      href: '/uposlenici',
      icon: Users,
      roles: ['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA']
    },
    {
      name: 'Raspored uposlenika',
      href: '/employee-schedule',
      icon: Calendar,
      roles: ['PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CAMERA', 'JOURNALIST']
    },
    {
      name: 'Statistika',
      href: '/statistika',
      icon: BarChart3,
      roles: ['PRODUCER', 'EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM']
    },
    {
      name: 'Admin',
      href: '/admin',
      icon: Settings,
      roles: ['ADMIN'],
      permission: 'admin.access'
    }
  ];

      const filteredNavigation = navigation.filter(item => {
        if (!user) return false;
        
        // Special case: Hide Wallboard Režija for emir.hukic (PRODUCER)
        if (item.name === 'Wallboard Režija' && user.username === 'emir.hukic' && user.role === 'PRODUCER') {
          return false;
        }
        
        // Check role
        if (!item.roles.includes(user.role)) {
          return false;
        }
        
        // Check permission if specified
        if (item.permission) {
          const hasPerm = hasPermission(item.permission);
          if (!hasPerm) {
            return false;
          }
        }
        
        return true;
      });

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white dark:bg-gray-800 shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <img 
                src="/rtvtk-logo.jpg" 
                alt="RTVTK Logo" 
                className="h-8 w-auto object-contain"
              />
              <span className="ml-2 text-lg font-bold text-gray-900 dark:text-gray-100">RTVTK</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-3 w-full flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="mr-3 h-4 w-4" />
              Odjavi se
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <img 
              src="/rtvtk-logo.jpg" 
              alt="RTVTK Logo" 
              className="h-8 w-auto object-contain"
            />
            <span className="ml-2 text-lg font-bold text-gray-900">RTVTK</span>
          </div>
          <nav className="mt-8 flex-1 px-2 space-y-1">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center w-full">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role}</p>
                {/* Session timer in sidebar */}
                <div className={`mt-1 text-xs ${
                  showWarning
                    ? 'text-red-600 font-medium'
                    : isSessionActive 
                      ? 'text-green-600' 
                      : 'text-gray-500'
                }`}>
                  {showWarning && timeLeft !== null 
                    ? `⏰ ${formatTimeRemaining(timeLeft)}`
                    : isSessionActive && timeUntilWarning > 0
                      ? `🟢 ${formatTimeRemaining(timeUntilWarning)}`
                      : isSessionActive 
                        ? '🟢 Aktivna' 
                        : '⏸️ Pauzirana'
                  }
                </div>
              </div>
              <button
                onClick={logout}
                className="ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                title="Odjavi se"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top bar */}
        <div className="sticky top-0 z-10 lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-50 dark:bg-gray-900">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Header with notifications - Mobile Optimized */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 md:px-4 py-2 md:py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center justify-between sm:justify-start gap-2 flex-1 min-w-0">
              <h1 className="text-sm md:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {user?.name} • {user?.role}
              </h1>
              {/* Session Activity Indicator */}
              <div className="flex items-center flex-shrink-0">
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                  showWarning
                    ? 'bg-red-100 text-red-800 animate-pulse'
                    : isSessionActive 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">
                    {showWarning && timeLeft !== null 
                      ? `Sesija ističe za ${formatTimeRemaining(timeLeft)}`
                      : isSessionActive && timeUntilWarning > 0
                        ? `Aktivna sesija (${formatTimeRemaining(timeUntilWarning)})`
                        : isSessionActive 
                          ? 'Aktivna sesija' 
                          : 'Sesija pauzirana'
                    }
                  </span>
                  <span className="sm:hidden">
                    {showWarning && timeLeft !== null 
                      ? formatTimeRemaining(timeLeft)
                      : isSessionActive && timeUntilWarning > 0
                        ? formatTimeRemaining(timeUntilWarning)
                        : isSessionActive 
                          ? 'Aktivna' 
                          : 'Pauza'
                    }
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 flex-shrink-0">
              {/* Dark Mode Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                title={darkMode ? 'Prebaci na svetli režim' : 'Prebaci na tamni režim'}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <Notifications />
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
