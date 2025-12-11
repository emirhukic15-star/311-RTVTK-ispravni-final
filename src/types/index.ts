// User and Authentication types
export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  newsroom_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  newsroom?: Newsroom;
}

export type UserRole = 'ADMIN' | 'PRODUCER' | 'EDITOR' | 'DESK_EDITOR' | 'CAMERMAN_EDITOR' | 'CHIEF_CAMERA' | 'CONTROL_ROOM' | 'VIEWER' | 'CAMERA' | 'JOURNALIST';

// Newsroom types
export interface Newsroom {
  id: number;
  name: string;
  pin: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Task and Disposition types
export interface Task {
  id: number;
  date: string;
  time_start: string;
  time_end: string;
  title: string;
  slugline: string;
  location: string;
  description: string;
  newsroom_id: number;
  newsroom_name?: string;
  coverage_type: CoverageType;
  attachment_type?: AttachmentType;
  status: TaskStatus;
  flags: TaskFlag[];
  journalist_ids: number[];
  cameraman_ids: number[];
  vehicle_id?: number;
  cameraman_id?: number;
  cameraman_assigned_by?: number;
  confirmed_by_name?: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  newsroom?: Newsroom;
  journalists?: Person[];
  cameramen?: Person[];
  vehicle?: Vehicle;
  cameraman?: Person;
}

export type CoverageType = 'ENG' | 'IFP' | 'EFP' | 'SNG' | 'LIVE' | 'STUDIO' | 'OB' | 'IP Live';
export type AttachmentType = 'PACKAGE' | 'VO' | 'VO/SOT' | 'SOT' | 'FEATURE' | 'NATPKG';
export type TaskStatus = 'DRAFT' | 'PLANIRANO' | 'DODIJELJENO' | 'U_TOKU' | 'SNIMLJENO' | 'OTKAZANO' | 'ARHIVIRANO' | 'URADJENO';
export type TaskFlag = 'TEMA' | 'UŽIVO' | 'REŽIJA' | 'VIBER/SKYPE' | 'PACKAGE' | 'SLUŽBENI PUT' | 'EMISIJA' | 'HITNO' | 'POTVRĐENO' | 'RAZMJENA';

// Task Preset types
export interface TaskPreset {
  id: number;
  name: string;
  title: string;
  slugline?: string;
  location?: string;
  coverage_type?: CoverageType;
  attachment_type?: AttachmentType;
  description?: string;
  newsroom_id?: number;
  journalist_ids: number[];
  cameraman_ids: number[];
  vehicle_id?: number;
  flags: TaskFlag[];
  created_by: number;
  created_at: string;
  updated_at: string;
  newsroom_name?: string;
  created_by_name?: string;
}

// Person types
export interface Person {
  id: number;
  name: string;
  role: UserRole;
  phone?: string;
  email?: string;
  newsroom_id?: number;
  position?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  newsroom_name?: string;
}

// Vehicle types
export interface Vehicle {
  id: number;
  name: string;
  plate_number: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Equipment types
export interface Equipment {
  id: number;
  name: string;
  type: string;
  serial_number?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Schedule types
export interface Schedule {
  id: number;
  person_id: number;
  date: string;
  shift_type: ShiftType;
  time_override?: string;
  notes?: string;
  newsroom_id: number;
  created_at: string;
  updated_at: string;
  person?: Person;
  newsroom?: Newsroom;
}

export interface ScheduleNote {
  id: number;
  date: string;
  note: string;
  newsroom_id: number;
  created_at: string;
  updated_at: string;
}

export type ShiftType = 
  | 'JUTARNJI_STUDIO_6h'
  | '8_16h'
  | '7_15_LINK'
  | '12_20h_LINK_Z'
  | '11_19h'
  | 'STD13_21h_Z'
  | 'SLOBODNI'
  | 'GODIŠNJI';

// Audit types
export interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  table_name: string;
  record_id: number;
  old_data?: string;
  new_data?: string;
  description?: string; // Detailed description of what was done
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  user_name?: string; // From LEFT JOIN with users table
  user_role?: string; // From LEFT JOIN with users table
  user?: User;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form types
export interface TaskFormData {
  date: string;
  time_start: string;
  time_end: string;
  title: string;
  slugline: string;
  location: string;
  description: string;
  newsroom_id: number;
  coverage_type: CoverageType;
  attachment_type?: AttachmentType;
  status: TaskStatus;
  flags: TaskFlag[];
  journalist_ids: number[];
  cameraman_ids: number[];
  vehicle_id?: number;
  cameraman_id?: number;
}

export interface ScheduleFormData {
  person_id: number;
  date: string;
  shift: string;
  notes?: string;
}

// Dashboard types
export interface DashboardStats {
  todayTasks: number;
  plannedTasks: number;
  activeTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  activeCameramen: number;
  assignedTasks?: number; // For CAMERMAN_EDITOR
  myCompletedTasks?: number; // For CAMERMAN_EDITOR
  myCancelledTasks?: number; // For CAMERMAN_EDITOR
}

// Wallboard types
export interface WallboardTask extends Task {
  timeRemaining?: number;
  isUrgent?: boolean;
  isBlinking?: boolean;
}

// Notification types
export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// Filter types
export interface TaskFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  newsroom_id?: number;
  status?: TaskStatus;
  coverage_type?: CoverageType;
  flags?: TaskFlag[];
  journalist_id?: number;
  cameraman_id?: number;
}

export interface ScheduleFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  person_id?: number;
  shift?: ShiftType;
}

// Export types
export interface ExportOptions {
  format: 'pdf' | 'csv' | 'json';
  dateFrom?: string;
  dateTo?: string;
  newsroom_id?: number;
  includeCompleted?: boolean;
}

// Backup types
export interface BackupInfo {
  id: number;
  filename: string;
  size: number;
  created_at: string;
  type: 'manual' | 'automatic';
}

// System settings types
export interface SystemSettings {
  autoBackup: boolean;
  backupRetentionDays: number;
  notificationSound: boolean;
  notificationInterval: number;
  defaultTaskStatus: TaskStatus;
  defaultCoverageType: CoverageType;
}
