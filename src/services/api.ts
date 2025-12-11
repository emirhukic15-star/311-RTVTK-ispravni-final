import axios, { AxiosInstance, AxiosResponse } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rtvtk_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    // Handle blob error responses - try to parse as JSON if possible
    if (error.response?.config?.responseType === 'blob' && error.response?.data instanceof Blob) {
      try {
        // Try to parse blob as JSON to get error message
        const text = await error.response.data.text();
        try {
          const errorJson = JSON.parse(text);
          error.response.data = errorJson;
        } catch {
          // If parsing fails, create a readable error object
          error.response.data = { message: text || 'Greška prilikom eksporta CSV-a' };
        }
      } catch {
        // If reading fails, create default error
        error.response.data = { message: 'Greška prilikom eksporta CSV-a' };
      }
    }
    
    if (error.response?.status === 401) {
      // Don't redirect if we're already on login page or if it's a login request
      const isLoginRequest = error.response?.config?.url?.includes('/auth/admin-login') || 
                            error.response?.config?.url?.includes('/auth/login');
      const isOnLoginPage = window.location.pathname === '/login';
      
      if (!isLoginRequest && !isOnLoginPage) {
      localStorage.removeItem('rtvtk_token');
      window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (pin: string, newsroomId?: number) =>
    api.post('/auth/login', { pin, newsroom_id: newsroomId }),
  
  me: () => api.get('/auth/me'),
  
  logout: () => api.post('/auth/logout'),
};

// Tasks API
export const tasksApi = {
  getAll: (filters?: any) => api.get('/tasks', { params: filters }),
  
  getById: (id: number) => api.get(`/tasks/${id}`),
  
  create: (data: any) => api.post('/tasks', data),
  
  update: (id: number, data: any) => api.put(`/tasks/${id}`, data),
  
  delete: (id: number) => api.delete(`/tasks/${id}`),
  
  assignCamera: (id: number, cameramanId: number) =>
    api.post(`/tasks/${id}/assign-camera`, { cameraman_id: cameramanId }),
  
  unassignCamera: (id: number, cameramanId: number) =>
    api.delete(`/tasks/${id}/assign-camera/${cameramanId}`),
  
  confirmRecorded: (id: number) => api.post(`/tasks/${id}/confirm-recorded`),
  
  updateStatus: (id: number, status: string) => api.put(`/tasks/${id}/status`, { status }),
  
  markAsDone: (id: number) => api.post(`/tasks/${id}/mark-done`),
  
  export: (options: any) => api.post('/tasks/export', options),
  
  exportByDate: (date: string) => api.get(`/tasks/export/${date}`, { responseType: 'blob' }),
};

// Newsrooms API
export const newsroomsApi = {
  getAll: () => api.get('/newsrooms'),
  
  getById: (id: number) => api.get(`/newsrooms/${id}`),
  
  create: (data: any) => api.post('/newsrooms', data),
  
  update: (id: number, data: any) => api.put(`/newsrooms/${id}`, data),
  
  delete: (id: number) => api.delete(`/newsrooms/${id}`),
};

// People API
export const peopleApi = {
  getAll: (filters?: any) => api.get('/people', { params: filters }),
  
  getById: (id: number) => api.get(`/people/${id}`),
  
  create: (data: any) => api.post('/people', data),
  
  update: (id: number, data: any) => api.put(`/people/${id}`, data),
  
  delete: (id: number) => api.delete(`/people/${id}`),
  
  getByRole: (role: string) => api.get(`/people/role/${role}`),
  
  getNewsrooms: () => api.get('/newsrooms'),
  
  getSchedules: (startDate: string, endDate: string) => 
    api.get('/employee-schedules', { 
      params: { 
        start: startDate, 
        end: endDate 
      } 
    }),
  
  createSchedule: (data: any) => api.post('/employee-schedules', data),
  
  updateSchedule: (id: number, data: any) => api.put(`/employee-schedules/${id}`, data),
  
  deleteSchedule: (id: number) => api.delete(`/employee-schedules/${id}`),
  
  getLeaveRequests: (filters?: any) => api.get('/leave-requests', { params: filters }),
  
  createLeaveRequest: (data: any) => api.post('/leave-requests', data),
  
  approveLeaveRequest: (id: number, status: string) =>
    api.put(`/leave-requests/${id}/approve`, { status }),

  // Schedule Notes API
  getScheduleNotes: (filters?: any) => api.get('/schedule/notes', { params: filters }),
  
  createScheduleNote: (data: any) => api.post('/schedule/notes', data),
  
  updateScheduleNote: (id: number, data: any) => api.put(`/schedule/notes/${id}`, data),
  
  deleteScheduleNote: (id: number) => api.delete(`/schedule/notes/${id}`),

  // Shift Types API
  getShiftTypes: () => api.get('/shift-types'),
  
  createShiftType: (data: any) => api.post('/shift-types', data),
  
  updateShiftType: (id: number, data: any) => api.put(`/shift-types/${id}`, data),
  
  deleteShiftType: (id: number) => api.delete(`/shift-types/${id}`),
};

// Schedules API
export const schedulesApi = {
  getAll: (filters?: any) => api.get('/schedules', { params: filters }),
  
  getById: (id: number) => api.get(`/schedules/${id}`),
  
  create: (data: any) => api.post('/schedules', data),
  
  update: (id: number, data: any) => api.put(`/schedules/${id}`, data),
  
  delete: (id: number) => api.delete(`/schedules/${id}`),
  
  getWeekly: (date: string) => api.get(`/schedules/weekly/${date}`),
  
  createWeekly: (data: any) => api.post('/schedules/weekly', data),
  
  export: (options: any) => api.post('/schedules/export', options),
};

// Vehicles API
export const vehiclesApi = {
  getAll: () => api.get('/vehicles'),
  
  getById: (id: number) => api.get(`/vehicles/${id}`),
  
  create: (data: any) => api.post('/vehicles', data),
  
  update: (id: number, data: any) => api.put(`/vehicles/${id}`, data),
  
  delete: (id: number) => api.delete(`/vehicles/${id}`),
};

// Equipment API
export const equipmentApi = {
  getAll: () => api.get('/equipment'),
  
  getById: (id: number) => api.get(`/equipment/${id}`),
  
  create: (data: any) => api.post('/equipment', data),
  
  update: (id: number, data: any) => api.put(`/equipment/${id}`, data),
  
  delete: (id: number) => api.delete(`/equipment/${id}`),
};

// Users API
export const usersApi = {
  getAll: () => api.get('/users'),
  
  getById: (id: number) => api.get(`/users/${id}`),
  
  create: (data: any) => api.post('/users', data),
  
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  
  delete: (id: number) => api.delete(`/users/${id}`),
  
  updatePassword: (id: number, data: any) => api.put(`/users/${id}/password`, data),
};

// Audit API
export const auditApi = {
  getAll: (filters?: any) => api.get('/audit', { params: filters }),
  
  getByUser: (userId: number) => api.get(`/audit/user/${userId}`),
  
  getByTable: (tableName: string) => api.get(`/audit/table/${tableName}`),
  
  deleteByDateRange: (data: { dateFrom?: string; dateTo?: string; deleteAllBefore?: boolean }) => 
    api.delete('/audit', { data }),
};

// Backup API
export const backupApi = {
  getAll: () => api.get('/backup'),
  
  create: () => api.post('/backup'),
  
  createDaily: () => api.post('/backup/daily'),
  
  restore: (filename: string) => api.post(`/backup/restore/${filename}`),
  
  download: (filename: string) => api.get(`/backup/download/${filename}`, { responseType: 'blob' }),
  
  delete: (filename: string) => api.delete(`/backup/${filename}`),
  
  // CSV Export
  exportByDate: (date: string) => api.get(`/tasks/export/${date}`, { responseType: 'blob' }),
  
  // Backup settings
  getSettings: () => api.get('/settings/backup'),
  
  updateSettings: (settings: { pdfExportPath?: string; backupTime?: string; backupEnabled?: boolean }) => 
    api.post('/settings/backup', settings),
};

// Dashboard API
export const dashboardApi = {
  getStats: (date?: string) => api.get(`/dashboard/stats${date ? `?date=${date}` : ''}`),
  
  getTodayTasks: (date?: string) => api.get(`/dashboard/today-tasks${date ? `?date=${date}` : ''}`),
  
  getUpcomingTasks: () => api.get('/dashboard/upcoming-tasks'),
};

// Statistics API
export const statisticsApi = {
  getStats: (dateFrom?: string, dateTo?: string, newsroomId?: string) => {
    const params: any = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (newsroomId) params.newsroom_id = newsroomId;
    return api.get('/statistics', { params });
  },
  getCameramanStats: (dateFrom?: string, dateTo?: string) => {
    const params: any = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    return api.get('/statistics/cameraman', { params });
  },
  getPeopleStats: (dateFrom?: string, dateTo?: string, newsroomId?: string, employeeId?: string) => {
    const params: any = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (newsroomId) params.newsroom_id = newsroomId;
    if (employeeId) params.employee_id = employeeId;
    return api.get('/statistics/people', { params });
  },
};

// Task Presets API
export const taskPresetsApi = {
  getAll: () => api.get('/task-presets'),
  
  create: (presetData: any) => api.post('/task-presets', presetData),
  
  update: (id: number, presetData: any) => api.put(`/task-presets/${id}`, presetData),
  
  delete: (id: number) => api.delete(`/task-presets/${id}`),
};


// Permissions API
export const permissionsApi = {
  getAll: () => api.get('/permissions'),
  create: (data: any) => api.post('/permissions', data),
  update: (id: number, data: any) => api.put(`/permissions/${id}`, data),
  delete: (id: number) => api.delete(`/permissions/${id}`)
};

// Roles API
export const rolesApi = {
  getAll: () => api.get('/roles'),
  create: (data: any) => api.post('/roles', data),
  update: (id: number, data: any) => api.put(`/roles/${id}`, data),
  delete: (id: number) => api.delete(`/roles/${id}`),
  getPermissions: (roleName: string) => api.get(`/roles/${roleName}/permissions`)
};

// Settings API
export const settingsApi = {
  get: () => api.get('/settings'),
  
  update: (data: any) => api.put('/settings', data),
};

// Schedule API
export const scheduleApi = {
  getWeek: (startDate: string, endDate: string) => 
    api.get(`/schedule/week?start=${startDate}&end=${endDate}`),
  
  create: (data: any) => api.post('/schedule', data),
  
  update: (id: number, data: any) => api.put(`/schedule/${id}`, data),
  
  delete: (id: number) => api.delete(`/schedule/${id}`),
  
  getNotes: (startDate: string, endDate: string) => 
    api.get(`/schedule/notes?start=${startDate}&end=${endDate}`),
  
  createNote: (data: any) => api.post('/schedule/notes', data),
  
  updateNote: (id: number, data: any) => api.put(`/schedule/notes/${id}`, data),
  
  deleteNote: (id: number) => api.delete(`/schedule/notes/${id}`),
};

// Notifications API
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  
  markAsRead: (id: number) => api.put(`/notifications/${id}/read`),
  
  delete: (id: number) => api.delete(`/notifications/${id}`),
};
