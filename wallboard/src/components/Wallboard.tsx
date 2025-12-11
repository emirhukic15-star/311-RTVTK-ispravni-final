import React, { useState, useEffect, useCallback } from 'react';
import { wallboardAPI, Task } from '../services/api';
import { Clock, Calendar, CheckCircle, Play, X } from 'lucide-react';
import './Wallboard.css';

interface WallboardProps {}

const Wallboard: React.FC<WallboardProps> = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Update current time every second
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
      
      const now = new Date();
      
      // Filter and sort tasks
      const filteredAndSortedTasks = fetchedTasks
        .filter(task => {
          // Hide completed/cancelled tasks older than 30 minutes
          if (task.status === 'SNIMLJENO' || task.status === 'OTKAZANO') {
            // Get task completion/update time
            const taskUpdateTime = new Date(task.updated_at);
            const timeSinceUpdate = now.getTime() - taskUpdateTime.getTime();
            const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
            
            // Hide if updated more than 30 minutes ago
            return timeSinceUpdate <= thirtyMinutes;
          }
          
          // Keep all other tasks
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

      setTasks(filteredAndSortedTasks);
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

  return (
    <div className="wallboard-container">
      {/* Header */}
      <header className="wallboard-header">
        <div className="header-left">
          <img src="/rtvtk-logo.jpg" alt="RTVTK Logo" className="logo" />
          <div className="header-text">
            <h1>RTVTK Wallboard</h1>
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
              className={`task-card ${getTaskStatusColor(task)}`}
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

              </div>
            </div>
          ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Wallboard;