import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});

let refreshTokenPromise: Promise<boolean> | null = null;

export async function initKeycloak(): Promise<void> {
  return new Promise((resolve, reject) => {
    keycloak
      .init({
        onLoad: 'login-required',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        if (authenticated) {
          // Store token in localStorage
          localStorage.setItem('kc_token', keycloak.token!);

          // Set up token refresh handler
          keycloak.onTokenExpired = () => {
            updateToken().catch((error) => {
              console.error('Failed to refresh token:', error);
              keycloak.logout();
            });
          };

          resolve();
        } else {
          console.warn('User is not authenticated');
          reject(new Error('User is not authenticated'));
        }
      })
      .catch((error) => {
        console.error('Failed to initialize Keycloak:', error);
        reject(error);
      });
  });
}

export async function updateToken(): Promise<boolean> {
  // Single shared in-flight refresh promise to avoid concurrent updates
  if (!refreshTokenPromise) {
    refreshTokenPromise = keycloak
      .updateToken(30) // Refresh if expiring in 30 seconds
      .then((refreshed) => {
        if (refreshed) {
          localStorage.setItem('kc_token', keycloak.token!);
        }
        refreshTokenPromise = null;
        return refreshed;
      })
      .catch((error) => {
        console.error('Token refresh failed:', error);
        refreshTokenPromise = null;
        keycloak.logout();
        throw error;
      });
  }

  return refreshTokenPromise;
}

export function getToken(): string {
  return keycloak.token || localStorage.getItem('kc_token') || '';
}

export function logout(): void {
  keycloak.logout();
  localStorage.removeItem('kc_token');
}

export default keycloak;
