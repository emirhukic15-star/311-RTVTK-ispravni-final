import axios from 'axios';

// Use environment variable or default to localhost
// For mobile access, set REACT_APP_API_URL=http://YOUR_IP:3001/api in .env file
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:3001/api';

export interface Task {
  id: number;
  title: string;
  slugline: string;
  location: string;
  description: string;
  date: string;
  time_start: string;
  time_end: string;
  status: string;
  priority: string;
  flags: string[];
  coverage_type: string;
  newsroom_id: number;
  newsroom_name: string;
  journalist_ids: number[];
  journalist_names: string[];
  cameraman_id: number;
  cameraman_name: string;
  vehicle_id: number;
  vehicle_name: string;
  equipment_id: number;
  equipment_name: string;
  confirmed_by_name?: string | null;
  is_completed: boolean;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Newsroom {
  id: number;
  name: string;
}

class WallboardAPI {
  async getTasks(date: string): Promise<Task[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/wallboard/tasks`, {
        params: { date }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }

  async getNewsrooms(): Promise<Newsroom[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/newsrooms`);
      return response.data;
    } catch (error) {
      console.error('Error fetching newsrooms:', error);
      return [];
    }
  }

  async completeTask(taskId: number): Promise<boolean> {
    try {
      const response = await axios.put(`${API_BASE_URL}/wallboard/tasks/${taskId}/complete`);
      return response.data.success;
    } catch (error) {
      console.error('Error completing task:', error);
      return false;
    }
  }

  async getTaskDetails(taskId: number): Promise<Task | null> {
    try {
      const response = await axios.get(`${API_BASE_URL}/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching task details:', error);
      return null;
    }
  }

  async updateTaskStatus(taskId: number, status: string, confirmedBy?: string, token?: string): Promise<boolean> {
    try {
      const headers: any = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await axios.put(`${API_BASE_URL}/wallboard/tasks/${taskId}/status`, {
        status: status,
        confirmed_by: confirmedBy || null
      }, { headers });
      return response.data.success;
    } catch (error) {
      console.error('Error updating task status:', error);
      return false;
    }
  }

  async login(username: string, password: string): Promise<{ success: boolean; token?: string; user?: { name: string; role: string } }> {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/admin-login`, {
        username,
        password
      });
      if (response.data.success) {
        return {
          success: true,
          token: response.data.token,
          user: {
            name: response.data.user.name,
            role: response.data.user.role
          }
        };
      }
      return { success: false };
    } catch (error: any) {
      console.error('Error logging in:', error);
      return { success: false };
    }
  }
}

export const wallboardAPI = new WallboardAPI();
