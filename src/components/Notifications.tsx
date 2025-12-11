import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Video, AlertTriangle, Calendar, MessageSquare, Plane, Camera as CameraIcon, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationsApi } from '../services/api';
import toast from 'react-hot-toast';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  task_id?: number;
  created_at: string;
  is_read: number;
}

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const isInitialLoad = useRef(true);
  const shownNotificationIds = useRef<Set<number>>(new Set());
  const isLoadingRef = useRef(false);
  const previousNotificationIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (user?.role === 'EDITOR' || user?.role === 'DESK_EDITOR' || user?.role === 'CHIEF_CAMERA' || user?.role === 'CAMERMAN_EDITOR' || user?.role === 'PRODUCER' || user?.role === 'CAMERA') {
      // Reset tracking when user changes
      isInitialLoad.current = true;
      shownNotificationIds.current.clear();
      previousNotificationIdsRef.current.clear();
      
      loadNotifications();
      
      // Automatically refresh notifications every 15 seconds (faster detection of new notifications)
      const refreshInterval = setInterval(() => {
        loadNotifications();
      }, 15 * 1000); // 15 seconds
      
      // Update current time every 30 seconds for countdown
      const timeInterval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 30000);
      
      return () => {
        clearInterval(refreshInterval);
        clearInterval(timeInterval);
      };
    } else {
      // Reset when user doesn't have permission
      isInitialLoad.current = true;
      shownNotificationIds.current.clear();
      previousNotificationIdsRef.current.clear();
      setNotifications([]);
      setHasUnread(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id]);

  const loadNotifications = async () => {
    // Prevent concurrent calls
    if (isLoadingRef.current) {
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      const response = await notificationsApi.getAll();
      if (response.data.success) {
        const newNotifications = response.data.data || [];
        const currentNotificationIds = newNotifications.map((n: Notification) => n.id);
        const currentNotificationIdsSet = new Set<number>(currentNotificationIds);
        
        // Get previous notification IDs from ref (more reliable than state)
        const previousNotificationIdsSet = previousNotificationIdsRef.current;
        
        // Find truly new notifications (notifications that weren't in the previous list)
        // This detects notifications that were just created
        const newNotificationIds = currentNotificationIds.filter((id: number) => !previousNotificationIdsSet.has(id));
        const newNotificationsList = newNotifications.filter((n: Notification) => 
          newNotificationIds.includes(n.id)
        );
        
        // Filter only unread new notifications for toast display
        const newUnreadNotifications = newNotificationsList.filter((n: Notification) => n.is_read === 0);
        
        // Save initial load state BEFORE we update anything
        const wasInitialLoad = isInitialLoad.current;
        
        // Debug logging (only in development)
        if (process.env.NODE_ENV === 'development' && (newUnreadNotifications.length > 0 || wasInitialLoad)) {
          console.log('📊 Notification check:', {
            wasInitialLoad,
            newUnreadCount: newUnreadNotifications.length,
            newUnreadIds: newUnreadNotifications.map((n: Notification) => n.id),
            previousIdsCount: previousNotificationIdsSet.size,
            previousIds: Array.from(previousNotificationIdsSet),
            currentIdsCount: currentNotificationIds.length,
            currentIds: currentNotificationIds
          });
        }
        
        // Check for deleted notifications (notifications that were in previous list but not in current)
        const deletedNotificationIds: number[] = [];
        previousNotificationIdsSet.forEach((id: number) => {
          if (!currentNotificationIdsSet.has(id)) {
            deletedNotificationIds.push(id);
          }
        });
        
        if (deletedNotificationIds.length > 0 && !wasInitialLoad) {
          toast.success(`${deletedNotificationIds.length} notifikacija je automatski obrisano`, {
            duration: 3000,
            icon: '🗑️',
          });
        }
        
        setNotifications(newNotifications);
        const unreadNotifications = newNotifications.filter((n: Notification) => n.is_read === 0);
        const currentCount = unreadNotifications.length;
        setHasUnread(currentCount > 0);
        
        // Show toast only for new notifications (not on initial load, and only if they are unread)
        if (!wasInitialLoad && newUnreadNotifications.length > 0) {
          // Check if we already showed toast for these notifications (prevent duplicates)
          const notificationsToShow = newUnreadNotifications.filter((n: Notification) => 
            !shownNotificationIds.current.has(n.id)
          );
          
          if (notificationsToShow.length > 0) {
            // Debug logging (only in development)
            if (process.env.NODE_ENV === 'development') {
              console.log('🔔 Showing toast for new notifications:', {
                count: notificationsToShow.length,
                ids: notificationsToShow.map((n: Notification) => n.id),
                messages: notificationsToShow.map((n: Notification) => n.message)
              });
            }
            
            // Mark these notifications as shown BEFORE showing toast
            notificationsToShow.forEach((n: Notification) => {
              shownNotificationIds.current.add(n.id);
            });
            
            if (notificationsToShow.length === 1) {
              const latestNotification = notificationsToShow[0];
              toast.success(latestNotification.message, {
                duration: 4000,
                icon: getNotificationIcon(latestNotification.type, latestNotification.message),
              });
          } else {
              toast.success(`${notificationsToShow.length} novih notifikacija`, {
              duration: 3000,
              icon: '🔔',
            });
          }
          
          // Trigger bell animation
          setTimeout(() => {
            const bellButton = document.querySelector('[data-bell-button]') as HTMLElement;
            if (bellButton) {
              bellButton.classList.add('animate-pulse');
              setTimeout(() => {
                bellButton.classList.remove('animate-pulse');
              }, 2000);
            }
          }, 100);
          } else {
            // Debug logging (only in development)
            if (process.env.NODE_ENV === 'development') {
              console.log('⚠️ New notifications found but already shown:', {
                newIds: newUnreadNotifications.map((n: Notification) => n.id),
                shownIds: Array.from(shownNotificationIds.current)
              });
            }
          }
        }
        
        // Update previous notification IDs ref AFTER we've processed everything
        // This ensures the baseline is set correctly for the next check
        previousNotificationIdsRef.current = currentNotificationIdsSet;
        
        // Mark initial load as complete AFTER we've set up the baseline
        if (wasInitialLoad) {
          // Store all current notification IDs so we don't show them as "new" on next load
          // We mark all current notifications as "shown" so they won't trigger toasts
          newNotifications.forEach((n: Notification) => {
            shownNotificationIds.current.add(n.id);
          });
          isInitialLoad.current = false;
          // Debug logging (only in development)
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Initial load complete. Notifications baseline set:', {
              total: newNotifications.length,
              unread: unreadNotifications.length,
              baselineIds: Array.from(currentNotificationIdsSet)
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
      setHasUnread(false);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Mark as read
      await notificationsApi.markAsRead(notification.id);
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: 1 } : n));
      setHasUnread(notifications.some(n => n.id !== notification.id && n.is_read === 0));
      
      // If notification has task_id, navigate to Dispozicija page with task_id
      if (notification.task_id) {
        setShowNotifications(false);
        
        // Fetch task details and navigate
        await fetchTaskAndNavigate(notification.task_id);
        
        // Show toast message after navigation
        toast.success('Preusmjeravanje na zadatak...', {
          duration: 2000,
          icon: '🔄',
        });
      } else {
        toast.success('Notifikacija označena kao pročitana', {
          duration: 2000,
          icon: '✅',
        });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast.error('Greška pri označavanju notifikacije');
    }
  };


  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => n.is_read === 0);
      await Promise.all(unreadNotifications.map(n => notificationsApi.markAsRead(n.id)));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setHasUnread(false);
      toast.success(`${unreadNotifications.length} notifikacija označeno kao pročitano`, {
        duration: 3000,
        icon: '📋',
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast.error('Greška pri označavanju notifikacija');
    }
  };

  const deleteNotification = async (notificationId: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the click handler
    
    try {
      await notificationsApi.delete(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Remove from shown notification IDs to free memory
      shownNotificationIds.current.delete(notificationId);
      
      // Update hasUnread state if needed
      const remainingNotifications = notifications.filter(n => n.id !== notificationId);
      setHasUnread(remainingNotifications.some(n => n.is_read === 0));
      
      toast.success('Notifikacija je obrisana', {
        duration: 2000,
        icon: '🗑️',
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Greška pri brisanju notifikacije');
    }
  };

  const fetchTaskAndNavigate = async (taskId: number) => {
    try {
      // Import tasksApi from services
      const { tasksApi } = await import('../services/api');
      const response = await tasksApi.getById(taskId);
      
      // Backend returns { success: true, data: task }
      const task = response.data.data;
      
      if (response.status === 200 && task && task.date) {
        // Navigate to dispozicija with the task's date and highlight the task
        navigate(`/dispozicija?date=${task.date}&task_id=${taskId}`);
      } else if (response.status === 404) {
        toast.error('Zadatak nije pronađen ili niste ovlašteni da ga vidite');
      } else {
        toast.error('Zadatak pronađen, ali datum nije dostupan');
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        toast.error('Zadatak nije pronađen ili niste ovlašteni da ga vidite');
      } else if (error.response?.status === 403) {
        toast.error('Nemate dozvolu za pristup ovom zadatku');
      } else {
        toast.error('Greška pri preusmjeravanju na zadatak');
      }
    }
  };

  const getNotificationIcon = (type: string, message: string) => {
    // Check if it's an urgent notification (contains HITNO flag)
    const isUrgent = message.includes('HITNO') || message.includes('🚨');
    
    if (type === 'task_created') {
      return (
        <div className={`p-1.5 md:p-2 rounded-lg ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <Calendar className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    if (type === 'travel_request') {
      return (
        <div className={`p-1.5 md:p-2 rounded-lg ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`}>
          <Plane className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    if (type === 'cameraman_assigned' || type === 'urgent_camera_assigned') {
      return (
        <div className={`p-1.5 md:p-2 rounded-lg ${isUrgent || type === 'urgent_camera_assigned' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 text-orange-600 dark:text-orange-400'}`}>
          <CameraIcon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    if (type === 'task_done') {
      return (
        <div className={`p-1.5 md:p-2 rounded-lg ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
          <CheckCheck className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    if (message.includes('snimljen')) {
      return (
        <div className="p-1.5 md:p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
          <Video className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    if (message.includes('otkazan')) {
      return (
        <div className="p-1.5 md:p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      );
    }
    return (
      <div className={`p-1.5 md:p-2 rounded-lg ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
        <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
      </div>
    );
  };

  const getNotificationColor = (type: string, message: string) => {
    // Check if it's an urgent notification (contains HITNO flag)
    const isUrgent = message.includes('HITNO') || message.includes('🚨');
    
    if (type === 'task_created') {
      return isUrgent 
        ? 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm' 
        : 'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-white shadow-sm';
    }
    if (type === 'travel_request') {
      return isUrgent 
        ? 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm' 
        : 'border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-white shadow-sm';
    }
    if (type === 'cameraman_assigned') {
      return isUrgent 
        ? 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm' 
        : 'border-l-4 border-orange-500 bg-gradient-to-r from-orange-50 to-white shadow-sm';
    }
    if (type === 'urgent_camera_assigned') {
      return 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm';
    }
    if (type === 'task_done') {
      return isUrgent 
        ? 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm' 
        : 'border-l-4 border-green-600 bg-gradient-to-r from-green-50 to-white shadow-sm';
    }
    if (message.includes('snimljen')) {
      return 'border-l-4 border-green-500 bg-gradient-to-r from-green-50 to-white shadow-sm';
    }
    if (message.includes('otkazan')) {
      return 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-white shadow-sm';
    }
    return 'border-l-4 border-gray-500 bg-gradient-to-r from-gray-50 to-white';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('bs-BA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeUntilExpiry = (dateString: string) => {
    const createdTime = new Date(dateString).getTime();
    const expiryTime = createdTime + (10 * 60 * 1000); // 10 minutes
    const timeLeft = expiryTime - currentTime;
    
    if (timeLeft <= 0) return null;
    
    const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
    return minutesLeft;
  };

  const getExpiryColor = (minutesLeft: number | null) => {
    if (!minutesLeft) return 'text-red-500';
    if (minutesLeft <= 2) return 'text-red-500';
    if (minutesLeft <= 5) return 'text-yellow-500';
    return 'text-gray-400';
  };

  if (!user || !['EDITOR', 'DESK_EDITOR', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'PRODUCER', 'CAMERA'].includes(user.role)) {
    return null;
  }

  return (
    <div className="relative">
      <button
        data-bell-button
        onClick={() => {
          setShowNotifications(!showNotifications);
          if (!showNotifications) {
            loadNotifications(); // Refresh notifications when opening
          }
        }}
        className="relative p-2 md:p-2.5 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded-full transition-all duration-300 hover:bg-gray-100 hover:shadow-md group min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        <Bell className={`h-5 w-5 md:h-6 md:w-6 transition-all duration-300 ${hasUnread ? 'animate-pulse text-blue-600' : 'group-hover:scale-110'}`} />
        {hasUnread && (
          <span className="absolute -top-1 -right-1 h-5 w-5 md:h-6 md:w-6 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center animate-bounce shadow-lg ring-2 ring-white">
            <span className="text-[10px] md:text-xs text-white font-bold">
              {notifications.filter(n => n.is_read === 0).length}
            </span>
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="fixed md:absolute right-0 md:right-0 top-0 md:top-auto md:mt-3 w-full md:w-96 max-w-full md:max-w-none h-screen md:h-auto max-h-screen md:max-h-[600px] bg-white dark:bg-gray-800 rounded-none md:rounded-2xl shadow-2xl border-0 md:border border-gray-200/50 dark:border-gray-700 z-50 transform transition-all duration-300 ease-out backdrop-blur-sm bg-white/95 dark:bg-gray-800/95 flex flex-col">
          <div className="p-4 md:p-5 border-b border-gray-200/50 dark:border-gray-700 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 rounded-none md:rounded-t-2xl flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2 md:space-x-3 flex-1 min-w-0">
                <div className="p-1.5 md:p-2 bg-white/20 rounded-lg backdrop-blur-sm flex-shrink-0">
                  <Bell className="h-4 w-4 md:h-5 md:w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-bold text-white truncate">Notifikacije</h3>
                  <div className="flex items-center flex-wrap gap-1.5 md:gap-2 mt-1">
                  {hasUnread && (
                      <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] md:text-xs px-2 md:px-2.5 py-0.5 md:py-1 rounded-full font-semibold whitespace-nowrap">
                      {notifications.filter(n => n.is_read === 0).length} nova
                    </span>
                  )}
                    <span className="text-[10px] md:text-xs text-white/80 bg-white/10 backdrop-blur-sm px-2 md:px-2.5 py-0.5 md:py-1 rounded-full whitespace-nowrap">
                    {notifications.length} aktivno
                  </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200 p-2 rounded-full backdrop-blur-sm min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800">
            {isLoading ? (
              <div className="p-8 md:p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 md:h-10 md:w-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 mx-auto"></div>
                <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium text-sm md:text-base">Učitavanje...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 md:p-12 text-center">
                <div className="p-3 md:p-4 bg-gray-100 dark:bg-gray-700 rounded-full w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 flex items-center justify-center">
                  <Bell className="h-6 w-6 md:h-8 md:w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-medium text-sm md:text-base">Nema novih notifikacija</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs md:text-sm mt-1">Obavještenja će se prikazati ovdje</p>
              </div>
            ) : (
              notifications.map((notification, index) => (
                <div
                  key={notification.id}
                  className={`p-3 md:p-4 border-b border-gray-100/50 dark:border-gray-700 hover:bg-gray-50/80 dark:hover:bg-gray-700/50 cursor-pointer transition-all duration-300 hover:shadow-md group ${
                    notification.is_read === 0 ? getNotificationColor(notification.type, notification.message) : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    animationDelay: `${index * 30}ms`,
                    animation: 'slideInFromRight 0.4s ease-out'
                  }}
                >
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="flex-shrink-0">
                      {getNotificationIcon(notification.type, notification.message)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-xs md:text-sm font-semibold break-words ${
                          notification.is_read === 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
                        }`}>
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-1.5 md:gap-2 ml-2 flex-shrink-0">
                          {notification.is_read === 0 && (
                            <div className="h-2 w-2 md:h-2.5 md:w-2.5 bg-blue-500 rounded-full animate-pulse ring-2 ring-blue-200 dark:ring-blue-800"></div>
                          )}
                          {notification.is_read === 1 && (
                            <CheckCheck className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-300 dark:text-gray-600" />
                          )}
                          <button
                            onClick={(e) => deleteNotification(notification.id, e)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all duration-200 p-1 md:p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                            title="Obriši notifikaciju"
                          >
                            <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </button>
                        </div>
                      </div>
                      <p className={`text-xs md:text-sm mt-1.5 md:mt-2 break-words leading-relaxed ${
                        notification.is_read === 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {notification.message}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 md:gap-0 mt-2 md:mt-3">
                        <p className="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5 flex-shrink-0" />
                          <span className="break-all">{formatDate(notification.created_at)}</span>
                        </p>
                        {(() => {
                          const minutesLeft = getTimeUntilExpiry(notification.created_at);
                          return minutesLeft && minutesLeft > 0 ? (
                            <span className={`text-[10px] md:text-xs ${getExpiryColor(minutesLeft)} font-semibold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full bg-opacity-10 whitespace-nowrap ${
                              minutesLeft <= 2 ? 'bg-red-100 dark:bg-red-900/30' : minutesLeft <= 5 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-gray-100 dark:bg-gray-700'
                            }`}>
                              🔥 {minutesLeft}min
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 md:p-4 border-t border-gray-200/50 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-700 rounded-none md:rounded-b-2xl flex-shrink-0">
              {notifications.some(n => n.is_read === 0) && (
                <button
                  onClick={markAllAsRead}
                  className="w-full flex items-center justify-center gap-2 text-xs md:text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 py-2 md:py-2.5 px-3 md:px-4 rounded-lg md:rounded-xl mb-2 md:mb-3 border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm min-h-[44px] md:min-h-0"
                >
                  <CheckCheck className="h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                  <span>Označi sve kao pročitane</span>
                </button>
              )}
              <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                ⏰ Notifikacije se automatski brišu svaki dan u 23:00. Možete ih ručno obrisati klikom na ikonu kante.
              </p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        
        .scrollbar-thin {
          scrollbar-width: thin;
        }
        
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default Notifications;