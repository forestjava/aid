import { config } from '../config.js';

const BASE_URL = `${config.NPM_BASE_URL}/api`;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

export class NpmError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = 'NpmError';
  }
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: config.NPM_IDENTITY,
      secret: config.NPM_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new NpmError(res.status, body, `NPM login failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { token: string; expires: string };
  const expiresAt = Date.parse(data.expires);
  cachedToken = { token: data.token, expiresAt };
  console.log('[npm] Logged in, token expires at', new Date(expiresAt).toISOString());
  return data.token;
}

async function getToken(): Promise<string> {
  if (cachedToken !== null && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  return login();
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export async function assertNpmOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await readBody(res);
    throw new NpmError(res.status, body, `NPM API error ${res.status}: ${body}`);
  }
}

export async function npmFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function npmGet<T>(path: string): Promise<T> {
  const res = await npmFetch(path);
  await assertNpmOk(res);
  return res.json() as Promise<T>;
}

export async function npmPost<T>(path: string, body: unknown): Promise<T> {
  const res = await npmFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await assertNpmOk(res);
  return res.json() as Promise<T>;
}

export async function npmDeleteRaw(path: string): Promise<Response> {
  return npmFetch(path, { method: 'DELETE' });
}
