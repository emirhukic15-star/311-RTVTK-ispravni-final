import React, { useState, useEffect, useCallback } from 'react';
import { wallboardAPI, Task } from '../services/api';
import { Clock, Calendar, CheckCircle, Play, X, Check, Ban } from 'lucide-react';
import './Wallboard.css';

interface WallboardProps {}

const Wallboard: React.FC<WallboardProps> = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmType, setConfirmType] = useState<'SNIMLJENO' | 'OTKAZANO' | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [confirmedByName, setConfirmedByName] = useState<string>('');
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Helper function to parse flags
  const parseFlags = (flags: any): string[] => {
    try {
      if (typeof flags === 'string') {
        return JSON.parse(flags);
      }
      if (Array.isArray(flags)) {
        return flags;
      }
      return [];
    } catch {
      return [];
    }
  };

  // Update current time every second to ensure accurate blinking
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Load tasks when date changes
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedTasks = await wallboardAPI.getTasks(selectedDate);
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 REALIZACIJA Wallboard - Fetched tasks:', fetchedTasks.length);
        fetchedTasks.forEach((task, index) => {
          const flags = parseFlags(task.flags);
          console.log(`Task ${index + 1}: "${task.title}"`, {
            flags,
            coverage_type: task.coverage_type,
            status: task.status
          });
        });
      }
      
      const now = new Date();
      
      // Filter and sort tasks
      const filteredAndSortedTasks = fetchedTasks
        .filter(task => {
          // REALIZACIJA filter: Show tasks with specific flags OR coverage types OR DNEVNIK
          const flags = parseFlags(task.flags);
          const requiredFlags = ['UŽIVO', 'VIBER/SKYPE', 'REŽIJA'];
          const requiredCoverageTypes = ['STUDIO', 'LIVE'];
          
          // Check if task has at least one of the required flags
          const hasRequiredFlag = requiredFlags.some(flag => flags.includes(flag));
          
          // Check if task has one of the required coverage types
          const hasRequiredCoverageType = requiredCoverageTypes.includes(task.coverage_type || '');
          
          // Show tasks that have at least one required flag OR one required coverage type
          // Also show tasks with title containing "DNEVNIK" as they are always relevant for realization
          const isDnevnik = task.title && task.title.toUpperCase().includes('DNEVNIK');
          
          const shouldShow = hasRequiredFlag || hasRequiredCoverageType || isDnevnik;
          
          // Debug logging
          if (process.env.NODE_ENV === 'development') {
            console.log(`Task "${task.title}":`, {
              flags,
              coverage_type: task.coverage_type,
              hasRequiredFlag,
              hasRequiredCoverageType,
              isDnevnik,
              shouldShow,
              status: task.status
            });
          }
          
          // If doesn't match filter criteria, skip it
          if (!shouldShow) {
            return false;
          }
          
          // Hide completed/cancelled tasks older than 30 minutes
          if (task.status === 'SNIMLJENO' || task.status === 'OTKAZANO') {
            // Get task completion/update time
            const taskUpdateTime = new Date(task.updated_at);
            const timeSinceUpdate = now.getTime() - taskUpdateTime.getTime();
            const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
            
            // Hide if updated more than 30 minutes ago
            return timeSinceUpdate <= thirtyMinutes;
          }
          
          // Keep all other tasks that pass the filter
          return true;
        })
        .sort((a, b) => {
          // Completed/cancelled tasks go to the end
          const aIsCompleted = a.status === 'SNIMLJENO' || a.status === 'OTKAZANO';
          const bIsCompleted = b.status === 'SNIMLJENO' || b.status === 'OTKAZANO';
          
          if (aIsCompleted && !bIsCompleted) return 1;
          if (!aIsCompleted && bIsCompleted) return -1;
          
          // For completed tasks, sort by update time (most recent first)
          if (aIsCompleted && bIsCompleted) {
            const aTime = new Date(a.updated_at).getTime();
            const bTime = new Date(b.updated_at).getTime();
            return bTime - aTime;
          }
          
          // For active tasks, sort by time_start (tasks with time first)
          if (a.time_start && !b.time_start) return -1;
          if (!a.time_start && b.time_start) return 1;
          if (!a.time_start && !b.time_start) return 0;
          
          // Sort by time
          return a.time_start.localeCompare(b.time_start);
        });

      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 REALIZACIJA Wallboard - Filtered tasks:', filteredAndSortedTasks.length);
      }

      setTasks(filteredAndSortedTasks);
      
      // Debug: Log tasks with confirmed_by_name
      if (process.env.NODE_ENV === 'development') {
        const tasksWithConfirmed = filteredAndSortedTasks.filter(t => t.status === 'SNIMLJENO' || t.status === 'OTKAZANO');
        if (tasksWithConfirmed.length > 0) {
          console.log('📋 Tasks with SNIMLJENO/OTKAZANO status:', tasksWithConfirmed.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            confirmed_by_name: t.confirmed_by_name
          })));
        }
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Load tasks on mount and when date changes
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Auto-refresh tasks every 60 seconds to hide completed tasks after 30 minutes
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadTasks();
    }, 60 * 1000); // 60 seconds

    return () => clearInterval(refreshInterval);
  }, [loadTasks]);

  // Auto-update task status to "U_TOKU" when task time starts
  useEffect(() => {
    if (!tasks.length) return;

    const checkAndUpdateTaskStatus = () => {
      const now = new Date();
      
      tasks.forEach(async (task) => {
        if (!task.time_start || task.status === 'SNIMLJENO' || task.status === 'OTKAZANO' || task.status === 'U_TOKU') {
          return;
        }

        const taskTime = new Date(`${task.date}T${task.time_start}`);
        const timeDiff = taskTime.getTime() - now.getTime();
        
        // If task time has started (timeDiff <= 0) and task is not already in progress
        if (timeDiff <= 0 && (task.status === 'PLANIRANO' || task.status === 'DODIJELJENO')) {
          try {
            await wallboardAPI.updateTaskStatus(task.id, 'U_TOKU');
            console.log(`Task ${task.id} automatically set to U_TOKU status`);
          } catch (error) {
            console.error('Error auto-updating task status:', error);
          }
        }
      });
    };

    checkAndUpdateTaskStatus();
    const statusCheckInterval = setInterval(checkAndUpdateTaskStatus, 60000); // Check every 60 seconds

    return () => clearInterval(statusCheckInterval);
  }, [tasks]);

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    return timeString.substring(0, 5); // HH:MM format
  };

  const getTimeDisplay = (task: Task) => {
    const flags = parseFlags(task.flags);
    const hasTemaFlag = flags.includes('TEMA');
    
    // If no time but has TEMA flag, show TEMA instead of N/A
    if (!task.time_start && hasTemaFlag) {
      return 'TEMA';
    }
    
    // Otherwise show normal time display
    if (!task.time_start && !task.time_end) {
      return 'N/A - N/A';
    }
    return `${formatTime(task.time_start)} - ${formatTime(task.time_end)}`;
  };

  const getTaskStatusColor = (task: Task) => {
    if (task.status === 'SNIMLJENO') return 'bg-green-100 border-green-500';
    if (task.status === 'OTKAZANO') return 'bg-gray-100 border-gray-500';
    if (task.status === 'U_TOKU') return 'bg-yellow-100 border-yellow-500';
    if (task.priority === 'HITNO') return 'bg-red-100 border-red-500';
    if (task.flags && parseFlags(task.flags).includes('HITNO')) return 'bg-red-100 border-red-500';
    return 'bg-blue-100 border-blue-500';
  };

  const getTaskStatusIcon = (task: Task) => {
    if (task.status === 'SNIMLJENO') return <CheckCircle className="w-6 h-6 text-green-600" />;
    if (task.status === 'OTKAZANO') return <X className="w-6 h-6 text-gray-600" />;
    if (task.status === 'U_TOKU') return <Play className="w-6 h-6 text-yellow-600" />;
    if (task.priority === 'HITNO' || (task.flags && parseFlags(task.flags).includes('HITNO'))) {
      return <X className="w-6 h-6 text-red-600" />;
    }
    return <Play className="w-6 h-6 text-blue-600" />;
  };

  const getCountdownDisplay = (task: Task) => {
    if (!task.time_start) return null;

    const now = new Date();
    const taskTime = new Date(`${task.date}T${task.time_start}`);
    const timeDiff = taskTime.getTime() - now.getTime();

    if (timeDiff <= 0) return null;

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Check if task should blink red (20 minutes or less before start)
  const shouldBlinkRed = (task: Task) => {
    if (!task.time_start || task.status === 'SNIMLJENO' || task.status === 'OTKAZANO' || task.status === 'U_TOKU') {
      return false;
    }

    // Use currentTime from state to ensure component re-renders every second
    const now = currentTime;
    const taskTime = new Date(`${task.date}T${task.time_start}`);
    const timeDiff = taskTime.getTime() - now.getTime();

    // 20 minutes = 20 * 60 * 1000 milliseconds
    const twentyMinutes = 20 * 60 * 1000;

    // Should blink if 20 minutes or less before start, but not if already started
    return timeDiff > 0 && timeDiff <= twentyMinutes;
  };

  const parseJournalistNames = (journalistNames: any): string[] => {
    try {
      if (typeof journalistNames === 'string') {
        return JSON.parse(journalistNames);
      }
      if (Array.isArray(journalistNames)) {
        return journalistNames;
      }
      return [];
    } catch {
      return [];
    }
  };

  // Handle confirm/cancel button click
  const handleConfirmClick = (taskId: number, type: 'SNIMLJENO' | 'OTKAZANO') => {
    // Check if user is authenticated
    if (!isAuthenticated || !currentUser) {
      // Store task info for after login
      setSelectedTaskId(taskId);
      setConfirmType(type);
      setShowLoginModal(true);
      return;
    }
    
    setSelectedTaskId(taskId);
    setConfirmType(type);
    // Automatically use current user's name
    setConfirmedByName(currentUser.name);
    setShowConfirmModal(true);
  };

  // Handle modal confirmation
  const handleConfirmSubmit = async () => {
    // Ensure user is authenticated and use their name
    if (!isAuthenticated || !currentUser) {
      alert('Morate biti ulogovani da biste potvrdili zadatak');
      setShowLoginModal(true);
      return;
    }

    if (!selectedTaskId || !confirmType) return;

    // Always use current user's name - prevent abuse
    const confirmedBy = currentUser.name;

    try {
      const success = await wallboardAPI.updateTaskStatus(selectedTaskId, confirmType, confirmedBy, authToken || undefined);
      if (success) {
        // Close modal first
        setShowConfirmModal(false);
        setConfirmedByName('');
        setSelectedTaskId(null);
        setConfirmType(null);
        
        // Automatically logout after successful confirmation to prevent abuse
        // This ensures that someone else can't use the same login to confirm another task
        handleLogout();
        
        // Reload tasks after a short delay to ensure backend has processed the update
        setTimeout(() => {
          loadTasks();
        }, 500);
      } else {
        alert('Greška prilikom ažuriranja statusa zadatka');
      }
    } catch (error) {
      console.error('Error confirming task:', error);
      alert('Greška prilikom ažuriranja statusa zadatka');
    }
  };

  // Handle login
  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('Molimo unesite korisničko ime i lozinku');
      return;
    }

    setLoginError('');
    const result = await wallboardAPI.login(loginUsername.trim(), loginPassword);

    if (result.success && result.token && result.user) {
      localStorage.setItem('wallboard_realizacija_token', result.token);
      localStorage.setItem('wallboard_realizacija_user', JSON.stringify(result.user));
      setAuthToken(result.token);
      setCurrentUser(result.user);
      setIsAuthenticated(true);
      setShowLoginModal(false);
      setLoginUsername('');
      setLoginPassword('');
      
      // If there's a pending task confirmation, automatically open the confirmation modal
      if (selectedTaskId && confirmType) {
        setConfirmedByName(result.user.name);
        setShowConfirmModal(true);
      }
    } else {
      setLoginError('Pogrešno korisničko ime ili lozinka');
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('wallboard_realizacija_token');
    localStorage.removeItem('wallboard_realizacija_user');
    setAuthToken(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShowLoginModal(true);
  };

  // Handle modal cancel
  const handleModalCancel = () => {
    setShowConfirmModal(false);
    setConfirmedByName('');
    setSelectedTaskId(null);
    setConfirmType(null);
  };

  return (
    <div className="wallboard-container">
      {/* Login Modal */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => {
          setShowLoginModal(false);
          setLoginUsername('');
          setLoginPassword('');
          setLoginError('');
          setSelectedTaskId(null);
          setConfirmType(null);
        }}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Prijava - Wallboard Realizacija</h2>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginUsername('');
                  setLoginPassword('');
                  setLoginError('');
                  setSelectedTaskId(null);
                  setConfirmType(null);
                }}
                className="modal-close"
              >
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">
                Molimo prijavite se da biste mogli potvrditi zadatke
              </p>
              {loginError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{loginError}</p>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Korisničko ime
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Korisničko ime"
                    className="modal-input"
                    autoFocus
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleLogin();
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lozinka
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Lozinka"
                    className="modal-input"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleLogin();
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginUsername('');
                  setLoginPassword('');
                  setLoginError('');
                  // Clear pending task if user cancels login
                  setSelectedTaskId(null);
                  setConfirmType(null);
                }}
                className="modal-button modal-button-cancel"
              >
                Napusti
              </button>
              <button 
                onClick={handleLogin} 
                className="modal-button modal-button-confirm"
                disabled={!loginUsername.trim() || !loginPassword.trim()}
              >
                Prijavi se
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="wallboard-header">
        <div className="header-left">
          <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" className="logo" />
          <div className="header-text">
            <h1>RTVTK Wallboard - REALIZACIJA</h1>
            <p>Dispozicija zadataka</p>
          </div>
        </div>
        
        <div className="header-center">
          <div className="date-selector">
            <Calendar className="w-6 h-6" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="date-input"
            />
          </div>
        </div>
        
        <div className="header-right">
          <div className="time-display">
            <Clock className="w-6 h-6" />
            <div className="time-text">
              <div className="current-time">
                {currentTime.toLocaleTimeString('hr-HR')}
              </div>
              <div className="current-date">
                {currentTime.toLocaleDateString('hr-HR')}
              </div>
            </div>
          </div>
          {isAuthenticated && currentUser && (
            <div className="flex items-center gap-4 ml-4">
              <span className="text-sm text-gray-600">
                Ulogovan kao: <strong>{currentUser.name}</strong>
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
              >
                Odjavi se
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Tasks Grid */}
      <main className="tasks-container">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Učitavanje zadataka...</p>
          </div>
        ) : (
          <div className="tasks-grid">
            {tasks.map((task) => (
            <div
              key={task.id}
              className={`task-card ${getTaskStatusColor(task)} ${shouldBlinkRed(task) ? 'blink-red-warning' : ''}`}
            >
              <div className="task-header">
                <div className="task-icon">
                  {getTaskStatusIcon(task)}
                </div>
                <div className="task-title">
                  <h3>{task.title}</h3>
                  {task.slugline && <p className="slugline">{task.slugline}</p>}
                </div>
                <div className="task-time">
                  <div className="time-display">
                    {getTimeDisplay(task)}
                  </div>
                  {getCountdownDisplay(task) && (
                    <div className="countdown">
                      Za {getCountdownDisplay(task)}
                    </div>
                  )}
                </div>
              </div>

              {/* Task Status */}
              <div className="task-status">
                <span className={`status-badge status-${task.status?.toLowerCase() || 'planirano'}`}>
                  {task.status || 'PLANIRANO'}
                </span>
                {/* Confirmed by info - Show prominently if task is completed or cancelled */}
                {(task.status === 'SNIMLJENO' || task.status === 'OTKAZANO') && task.confirmed_by_name && (
                  <div className="task-confirmed-by-inline">
                    <span className="confirmed-by-label">
                      {task.status === 'SNIMLJENO' ? '✅ Potvrdio/la:' : '❌ Otkazao/la:'}
                    </span>
                    <span className="confirmed-by-name">
                      {task.confirmed_by_name}
                    </span>
                  </div>
                )}
              </div>

              <div className="task-content">
                <div className="task-location">
                  <strong>Lokacija:</strong> {task.location || 'N/A'}
                </div>
                <div className="task-description">
                  {task.description}
                </div>
                
                <div className="task-assignments">
                  <div className="assignment-row">
                    <span className="label">Redakcija:</span>
                    <span>{task.newsroom_name}</span>
                  </div>
                  <div className="assignment-row">
                    <span className="label">Kamerman:</span>
                    <span>{task.cameraman_name || 'Nije dodjeljen'}</span>
                  </div>
                  {parseJournalistNames(task.journalist_names).length > 0 && (
                    <div className="assignment-row">
                      <span className="label">Novinari:</span>
                      <span>{parseJournalistNames(task.journalist_names).join(', ')}</span>
                    </div>
                  )}
                  {task.vehicle_name && (
                    <div className="assignment-row">
                      <span className="label">Vozilo:</span>
                      <span>{task.vehicle_name}</span>
                    </div>
                  )}
                </div>

                {/* Flags Section */}
                {parseFlags(task.flags).length > 0 && (
                  <div className="task-flags">
                    {parseFlags(task.flags).map((flag, index) => (
                      <span key={index} className="flag">
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Confirmed by info - Show if task is completed or cancelled (backup display if not in status) */}
                {(task.status === 'SNIMLJENO' || task.status === 'OTKAZANO') && task.confirmed_by_name && (
                  <div className="task-confirmed-by">
                    <span className="confirmed-by-label">
                      {task.status === 'SNIMLJENO' ? '✅ Potvrdio/la:' : '❌ Otkazao/la:'}
                    </span>
                    <span className="confirmed-by-name">
                      {task.confirmed_by_name}
                    </span>
                  </div>
                )}

                {/* Action Buttons - Show only if task is not already completed or cancelled */}
                {task.status !== 'SNIMLJENO' && task.status !== 'OTKAZANO' && (
                  <div className="task-actions">
                    <button
                      onClick={() => handleConfirmClick(task.id, 'SNIMLJENO')}
                      className="action-button action-button-complete"
                      title="Označi kao završeno"
                    >
                      <Check size={20} style={{ marginRight: '8px' }} />
                      ZAVRŠENO
                    </button>
                    <button
                      onClick={() => handleConfirmClick(task.id, 'OTKAZANO')}
                      className="action-button action-button-cancel"
                      title="Označi kao otkazano"
                    >
                      <Ban size={20} style={{ marginRight: '8px' }} />
                      OTKAZANO
                    </button>
                  </div>
                )}

              </div>
            </div>
          ))}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={handleModalCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {confirmType === 'SNIMLJENO' ? '✅ Završi zadatak' : '❌ Otkaži zadatak'}
              </h2>
              <button onClick={handleModalCancel} className="modal-close">
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">
                {confirmType === 'SNIMLJENO' 
                  ? 'Potvrdite završetak zadatka:'
                  : 'Potvrdite otkazivanje zadatka:'}
              </p>
              {currentUser && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Potvrđuje:</strong> {currentUser.name}
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-4">
                Zadatak će biti potvrđen sa vašim imenom ({currentUser?.name || 'N/A'})
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={handleModalCancel} className="modal-button modal-button-cancel">
                Otkaži
              </button>
              <button 
                onClick={handleConfirmSubmit} 
                className={`modal-button ${confirmType === 'SNIMLJENO' ? 'modal-button-confirm' : 'modal-button-danger'}`}
                disabled={!isAuthenticated || !currentUser}
              >
                {confirmType === 'SNIMLJENO' ? 'Potvrdi završetak' : 'Potvrdi otkazivanje'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallboard;