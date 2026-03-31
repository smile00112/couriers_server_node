import type { AuthProvider } from '@refinedev/core';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    try {
      const { data } = await axios.post<{ access_token: string }>(
        `${API_URL}/api/v1/auth/courier/login`,
        { username: email, password },
      );

      if (data?.access_token) {
        localStorage.setItem('access_token', data.access_token);
        return { success: true, redirectTo: '/orders' };
      }

      return { success: false, error: { name: 'LoginError', message: 'No token received.' } };
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? ((error.response?.data as { message?: string })?.message ?? 'Invalid credentials.')
        : 'Login failed.';
      return { success: false, error: { name: 'LoginError', message } };
    }
  },

  logout: async () => {
    localStorage.removeItem('access_token');
    return { success: true, redirectTo: '/login' };
  },

  check: async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      return { authenticated: true };
    }
    return { authenticated: false, redirectTo: '/login' };
  },

  getIdentity: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    const payload = decodeJwt(token);
    return {
      id: payload.sub as string,
      name: (payload.name as string | undefined) ?? (payload.sub as string),
      role: payload.role as string,
      owner_id: payload.owner_id as string,
    };
  },

  onError: async (error: unknown) => {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) {
      return { logout: true, redirectTo: '/login', error: error as Error };
    }
    return { error: error as Error };
  },
};
