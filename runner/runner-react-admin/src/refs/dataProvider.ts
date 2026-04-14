import simpleRestProvider from 'ra-data-simple-rest';
import { fetchUtils } from 'react-admin';
import { getToken } from './authProvider';

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const apiUrl = '/api';

export const dataProvider = simpleRestProvider(apiUrl, httpClient);
