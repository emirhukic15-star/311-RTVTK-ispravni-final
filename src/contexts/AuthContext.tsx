import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { api, rolesApi } from '../services/api';
import toast from 'react-hot-toast';
import { subscribeUserToPush, isPushNotificationSupported } from '../services/pushNotifications';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: string | { username: string; password: string }, newsroomId?: number) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  hasPermission: (permission: string) => boolean;
  dynamicPermissions: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dynamicPermissions, setDynamicPermissions] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load dynamic permissions for user's role
  const loadDynamicPermissions = async (role: string) => {
    try {
      // Loading dynamic permissions for role
      const response = await rolesApi.getPermissions(role);
      if (response.data.success) {
        setDynamicPermissions(response.data.data);
      } else {
        // Failed to load dynamic permissions, using fallback
        // Fallback to hardcoded permissions if dynamic loading fails
        setDynamicPermissions([]);
      }
    } catch (error) {
      console.error('Error loading dynamic permissions:', error);
      // Fallback to hardcoded permissions if dynamic loading fails
      setDynamicPermissions([]);
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('rtvtk_token');
      if (token) {
        await refreshUser();
      } else {
        setLoading(false);
      }
      setIsInitialized(true);
    };
    
    initializeAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.data);
        // Load dynamic permissions for the user's role
        loadDynamicPermissions(response.data.data.role);
      } else {
        localStorage.removeItem('rtvtk_token');
        setUser(null);
      }
    } catch (error) {
      localStorage.removeItem('rtvtk_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: string | { username: string; password: string }, newsroomId?: number): Promise<boolean> => {
    try {
      setLoading(true);
      
      let response;
      if (typeof credentials === 'string') {
        // PIN login
        response = await api.post('/auth/login', {
          pin: credentials,
          newsroom_id: newsroomId
        });
      } else {
        // Username/password login - admin only
        response = await api.post('/auth/admin-login', {
          username: credentials.username,
          password: credentials.password
        });
      }

      if (response.data.success) {
        const { token, user: userData } = response.data;
        localStorage.setItem('rtvtk_token', token);
        setUser(userData);
        
        // Load dynamic permissions for the user's role
        loadDynamicPermissions(userData.role);
        
        // Register push notifications if supported
        if (isPushNotificationSupported()) {
          // Check if user has already granted permission
          if (Notification.permission === 'granted') {
            subscribeUserToPush(token).catch(error => {
              console.error('Error subscribing to push notifications:', error);
            });
          } else if (Notification.permission === 'default') {
            // Ask for permission after a short delay
            setTimeout(() => {
              subscribeUserToPush(token).catch(error => {
                console.error('Error subscribing to push notifications:', error);
              });
            }, 2000);
          }
        }
        
        toast.success(`Dobrodošli, ${userData.name}!`);
        return true;
      } else {
        // Don't show toast here - let Login component handle error display
        return false;
      }
    } catch (error: any) {
      // Don't show toast here - let Login component handle error display
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('rtvtk_token');
    setUser(null);
    setDynamicPermissions([]);
    toast.success('Uspešno ste se odjavili');
  };

  const hasRole = (roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    
    // Define permissions based on roles (updated and optimized)
    const rolePermissions: Record<string, string[]> = {
      ADMIN: [
        'admin.access', 'user.manage', 'newsroom.manage', 'audit.view',
        'task.create', 'task.edit', 'task.delete', 'task.view', 'task.assign_camera', 'task.confirm_recorded', 'task.export', 'task.print',
        'schedule.manage', 'schedule.export', 'schedule.print', 'people.manage', 'people.delete', 'people.export', 'people.print',
        'camera.manage', 'statistics.view', 'statistics.export', 'dashboard.view', 'user.view',
        'wallboard.view', 'wallboard.control_room'
      ],
      PRODUCER: [
        'admin.access', 'user.manage', 'newsroom.manage', 'audit.view',
        'task.create', 'task.edit', 'task.delete', 'task.view', 'task.assign_camera', 'task.confirm_recorded', 'task.export', 'task.print',
        'schedule.manage', 'schedule.export', 'schedule.print', 'people.manage', 'people.delete', 'people.export', 'people.print',
        'camera.manage', 'statistics.view', 'statistics.export', 'dashboard.view', 'user.view',
        'wallboard.view', 'wallboard.control_room'
      ],
      EDITOR: [
        'task.create', 'task.edit', 'task.delete', 'task.view', 'task.export', 'task.print',
        'schedule.manage', 'schedule.view', 'schedule.export', 'schedule.print',
        'people.manage', 'people.delete', 'people.export', 'people.print', 'statistics.view', 'statistics.export', 'dashboard.view'
      ],
      DESK_EDITOR: [
        'task.create', 'task.edit', 'task.delete', 'task.view', 'task.export', 'task.print',
        'schedule.view', 'schedule.export', 'schedule.print', 'people.view', 'dashboard.view'
      ],
      CAMERMAN_EDITOR: [
        'task.view', 'task.assign_camera', 'task.confirm_recorded', 'task.export', 'task.print',
        'schedule.view', 'schedule.export', 'schedule.print', 'people.view', 'dashboard.view'
      ],
      CHIEF_CAMERA: [
        'task.view', 'task.assign_camera', 'task.confirm_recorded', 'task.export', 'task.print',
        'schedule.manage', 'schedule.export', 'schedule.print', 'people.manage', 'people.delete', 'people.export', 'people.print',
        'camera.manage', 'statistics.view', 'statistics.export', 'dashboard.view', 'user.view'
      ],
      CONTROL_ROOM: [
        'task.view', 'task.confirm_recorded', 'task.export', 'task.print',
        'statistics.view', 'statistics.export', 'dashboard.view', 'wallboard.view', 'wallboard.control_room'
      ],
      VIEWER: [
        'task.view', 'statistics.view', 'dashboard.view'
      ],
      CAMERA: [
        'task.view', 'task.confirm_recorded', 'dashboard.view', 'schedule.view'
      ],
      JOURNALIST: [
        'task.view', 'dashboard.view', 'schedule.view'
      ]
    };

    // First check dynamic permissions from database
    if (dynamicPermissions.includes(permission)) {
      return true;
    }
    
    // Fallback to hardcoded permissions if dynamic permissions are not loaded yet
    const hasHardcodedPermission = rolePermissions[user.role]?.includes(permission) || false;
    return hasHardcodedPermission;
  };

  const value: AuthContextType = {
    user,
    loading: loading || !isInitialized,
    login,
    logout,
    refreshUser,
    hasRole,
    hasPermission,
    dynamicPermissions
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
