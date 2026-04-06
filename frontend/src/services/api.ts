// ============================================================
// nexus/frontend/src/services/api.ts
// Axios instance with JWT refresh, queuing, and all API helpers
// ============================================================
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token!));
  refreshQueue = [];
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      const url = typeof original.url === 'string' ? original.url : '';
      // Don't attempt token refresh for auth endpoints themselves.
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/logout') ||
        url.includes('/auth/me')
      ) {
        return Promise.reject(error);
      }

      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      isRefreshing = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (!refreshToken) {
        processQueue(error, null);
        logout();
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        setTokens(data.accessToken, data.refreshToken);
        processQueue(null, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register:            (d: { email: string; password: string; fullName: string }) => api.post('/auth/register', d),
  login:               (d: { email: string; password: string }) => api.post('/auth/login', d),
  logout:              () => api.post('/auth/logout'),
  logoutAll:           () => api.post('/auth/logout-all'),
  me:                  () => api.get('/auth/me'),
  verifyEmail:         (token: string) => api.get(`/auth/verify-email?token=${token}`),
  resendVerification:  (email: string) => api.post('/auth/resend-verification', { email }),
  forgotPassword:      (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword:       (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
  getSessions:         () => api.get('/auth/sessions'),
  revokeSession:       (id: string) => api.delete(`/auth/sessions/${id}`),
};

export const projectsAPI = {
  list:   () => api.get('/projects'),
  get:    (id: string) => api.get(`/projects/${id}`),
  create: (d: object) => api.post('/projects', d),
  update: (id: string, d: object) => api.patch(`/projects/${id}`, d),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export const tasksAPI = {
  list:   (projectId: string, params?: object) => api.get(`/projects/${projectId}/tasks`, { params }),
  get:    (projectId: string, taskId: string) => api.get(`/projects/${projectId}/tasks/${taskId}`),
  create: (projectId: string, d: object) => api.post(`/projects/${projectId}/tasks`, d),
  update: (projectId: string, taskId: string, d: object) => api.patch(`/projects/${projectId}/tasks/${taskId}`, d),
  delete: (projectId: string, taskId: string) => api.delete(`/projects/${projectId}/tasks/${taskId}`),
};

export const milestonesAPI = {
  list:   (projectId: string) => api.get(`/projects/${projectId}/milestones`),
  create: (projectId: string, d: { title: string; dueDate: string }) => api.post(`/projects/${projectId}/milestones`, d),
  update: (projectId: string, milestoneId: string, d: { title?: string; dueDate?: string }) => api.patch(`/projects/${projectId}/milestones/${milestoneId}`, d),
  delete: (projectId: string, milestoneId: string) => api.delete(`/projects/${projectId}/milestones/${milestoneId}`),
};

export const teamsAPI = {
  list:   () => api.get('/teams'),
  create: (d: object) => api.post('/teams', d),
  invite: (teamId: string, d: object) => api.post(`/teams/${teamId}/invite`, d),
  members: (teamId: string) => api.get(`/teams/${teamId}/members`),
  removeMember: (teamId: string, userId: string) => api.delete(`/teams/${teamId}/members/${userId}`),
  pending: (teamId: string) => api.get(`/teams/${teamId}/pending`),
  revokePending: (teamId: string, email: string) => api.delete(`/teams/${teamId}/pending`, { data: { email } }),
};

export const usersAPI = {
  search:         (params: object) => api.get('/users', { params }),
  updateProfile:  (id: string, d: object) => api.patch(`/users/${id}`, d),
  changePassword: (id: string, d: object) => api.post(`/users/${id}/change-password`, d),
};

export const notificationsAPI = {
  unread: () => api.get('/notifications'),
  markRead: (ids?: string[]) => api.post('/notifications/read', { ids: ids || [] }),
};

export const dashboardAPI = {
  summary: () => api.get('/dashboard/summary'),
};
