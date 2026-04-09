import { fetchUtils, DataProvider } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { getToken } from './auth/keycloak.js';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Custom HTTP client with Bearer token injection
const httpClient = (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = getToken();

  if (!options.headers) {
    options.headers = new Headers();
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, { ...options, headers });
};

// Base data provider with customized HTTP client
const dataProvider = simpleRestProvider(apiUrl, httpClient);

// Export the data provider
export default dataProvider;
