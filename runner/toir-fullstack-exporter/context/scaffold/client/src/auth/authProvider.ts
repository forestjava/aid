import type { AuthProvider } from 'react-admin';
import keycloak, { getToken, logout, updateToken } from './keycloak.js';

export const authProvider: AuthProvider = {
  login: async () => {
    // Keycloak login is handled in initKeycloak() during app startup
    return Promise.resolve();
  },

  logout: async () => {
    logout();
    return Promise.resolve();
  },

  checkAuth: async () => {
    try {
      await updateToken();
      if (!getToken()) {
        return Promise.reject(new Error('No valid token'));
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  },

  checkError: async (error: { status?: number }) => {
    const status = error.status;

    // 401: unauthorized — re-authenticate
    if (status === 401) {
      logout();
      return Promise.reject(new Error('Unauthorized'));
    }

    // 403: forbidden — permission error (user is authenticated but lacks permission)
    if (status === 403) {
      return Promise.reject(new Error('Forbidden: insufficient permissions'));
    }

    return Promise.resolve();
  },

  getIdentity: async () => {
    try {
      const token = getToken();
      if (!token) return Promise.reject(new Error('No token'));

      // Decode JWT manually (keycloak-js doesn't expose decoded token easily)
      const parts = token.split('.');
      if (parts.length !== 3) return Promise.reject(new Error('Invalid token format'));

      const decoded = JSON.parse(atob(parts[1])) as {
        sub?: string;
        preferred_username?: string;
        name?: string;
      };

      return Promise.resolve({
        id: decoded.sub ?? 'unknown',
        fullName: decoded.name ?? decoded.preferred_username ?? 'User',
      });
    } catch (error) {
      return Promise.reject(error);
    }
  },

  getPermissions: async () => {
    try {
      const token = getToken();
      if (!token) return Promise.reject(new Error('No token'));

      const parts = token.split('.');
      if (parts.length !== 3) return Promise.reject(new Error('Invalid token format'));

      const decoded = JSON.parse(atob(parts[1])) as {
        realm_access?: { roles?: string[] };
      };

      return Promise.resolve(decoded.realm_access?.roles ?? []);
    } catch (error) {
      return Promise.reject(error);
    }
  },
};
