import type { DataProvider, Pagination } from '@refinedev/core';
import simpleRestProvider from '@refinedev/simple-rest';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Shared axios instance with auth + error interceptors
export const httpClient = axios.create({ baseURL: API_URL });

httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const status = error.response?.status;
    const serverMessage = error.response?.data?.message as string | undefined;

    if (status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }

    const humanMessages: Record<number, string> = {
      403: 'You do not have permission to perform this action.',
      404: 'Record not found.',
      409: serverMessage ?? 'Conflict.',
      422: serverMessage ?? 'Validation error.',
      500: 'An unexpected error occurred. Please try again.',
    };

    const message = (status !== undefined ? humanMessages[status] : undefined) ?? serverMessage ?? 'An unexpected error occurred.';
    return Promise.reject(new Error(message));
  },
);

const baseProvider = simpleRestProvider(API_URL, httpClient);

// Override getList to map our { data, meta } pagination shape → Refine's { data, total }
export const dataProvider: DataProvider = {
  ...baseProvider,
  getList: async ({ resource, pagination, sorters, filters }) => {
    const { current = 1, pageSize = 20 } = (pagination ?? {}) as Pagination & { current?: number; pageSize?: number };

    const query: Record<string, unknown> = {
      page: current,
      limit: pageSize,
    };

    if (sorters?.length) {
      const { field, order } = sorters[0];
      query.sort = field;
      query.order = order;
    }

    if (filters?.length) {
      filters.forEach((f) => {
        if ('field' in f) {
          query[f.field] = f.value;
        }
      });
    }

    const url = `${API_URL}/${resource}`;
    const { data: response } = await httpClient.get(url, { params: query });

    // Backend returns { data: [...], meta: { total, page, limit, total_pages } }
    if (response && typeof response === 'object' && 'data' in response && 'meta' in response) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { data: (response as any).data, total: (response as any).meta.total };
    }

    // Fallback: plain array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: response as any, total: (response as unknown[]).length };
  },
};
