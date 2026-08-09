import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = "http://192.168.1.15:3000";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('device_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // LOG REQUEST
  console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  if (config.data) {
    console.log(`[API REQUEST BODY]`, JSON.stringify(config.data, null, 2));
  }

  return config;
}, (error) => {
  console.error(`[API REQUEST ERROR]`, error);
  return Promise.reject(error);
});

client.interceptors.response.use((response) => {
  // LOG RESPONSE
  console.log(`[API RESPONSE] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
  if (response.data) {
    console.log(`[API RESPONSE DATA]`, JSON.stringify(response.data, null, 2));
  }
  return response;
}, (error) => {
  // LOG RESPONSE ERROR
  if (error.response) {
    console.warn(`[API RESPONSE ERROR] ${error.response.status} ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
    console.warn(`[API RESPONSE ERROR DATA]`, JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(`[API NETWORK ERROR] ${error.config?.method?.toUpperCase()} ${error.config?.url} -> ${error.message}`);
  }
  return Promise.reject(error);
});

export default client;

// Auth & Health
export const authApi = {
  healthCheck: () => client.get('/health'),
  login: (username: string, password: string) => client.post('/auth/login', { username, password }),
  checkSession: () => client.get('/auth/session'),
};

export const vaultApi = {
  getPlatforms: () => client.get('/vault'),
  savePlatform: (data: any) => client.post('/vault', data),
  updatePlatform: (id: string, data: any) => client.put(`/vault/${id}`, data),
  deletePlatform: (id: string) => client.delete(`/vault/${id}`),
};

// Links API
export const linksApi = {
  getLinks: () => client.get('/links'),
  previewLink: (url: string) => client.post('/links/preview', { url }),
  saveLink: (data: any) => client.post('/links', data),
  updateLink: (id: string, data: any) => client.put(`/links/${id}`, data),
  toggleFavorite: (id: string, isFavorite: boolean) => client.put(`/links/${id}/favorite`, { isFavorite }),
  toggleHide: (id: string, isHidden: boolean) => client.put(`/links/${id}/hide`, { isHidden }),
  deleteLink: (id: string) => client.delete(`/links/${id}`),
};
