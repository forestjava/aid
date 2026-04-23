import Keycloak from 'keycloak-js';
import { AuthProvider } from 'react-admin';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

let authenticated = false;

export const initKeycloak = async (): Promise<boolean> => {
  authenticated = await keycloak.init({
    onLoad: 'login-required',
    checkLoginIframe: false,
  });
  return authenticated;
};

export const getToken = (): string | undefined => keycloak.token;

export const authProvider: AuthProvider = {
  login: async () => {
    if (!authenticated) {
      await keycloak.login();
    }
  },
  logout: async () => {
    await keycloak.logout({ redirectUri: window.location.origin });
  },
  checkError: async (error) => {
    if (error.status === 401 || error.status === 403) {
      try {
        const refreshed = await keycloak.updateToken(30);
        if (!refreshed) throw new Error('Token refresh failed');
      } catch {
        await keycloak.logout({ redirectUri: window.location.origin });
        throw new Error('Session expired');
      }
    }
  },
  checkAuth: async () => {
    if (!keycloak.authenticated) {
      throw new Error('Not authenticated');
    }
    try {
      await keycloak.updateToken(30);
    } catch {
      throw new Error('Token refresh failed');
    }
  },
  getPermissions: async () => {
    const roles = keycloak.tokenParsed?.realm_access?.roles ?? [];
    return roles;
  },
  getIdentity: async () => ({
    id: keycloak.tokenParsed?.sub ?? '',
    fullName: keycloak.tokenParsed?.preferred_username ?? '',
  }),
};
