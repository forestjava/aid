import { config } from '../config.js';

const BASE_URL = `${config.PORTAINER_BASE_URL}/api`;

export class PortainerError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortainerError';
  }
}

function authHeaders(): Record<string, string> {
  return {
    'X-API-Key': config.PORTAINER_API_KEY!,
    'Content-Type': 'application/json',
  };
}

async function portainerFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await readBody(res);
    throw new PortainerError(res.status, body, `Portainer API error ${res.status}: ${body}`);
  }
}

export async function portainerGet<T>(path: string): Promise<T> {
  const res = await portainerFetch(path);
  await assertOk(res);
  return res.json() as Promise<T>;
}

export async function portainerPost<T>(path: string, body: unknown): Promise<T> {
  const res = await portainerFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await assertOk(res);
  return res.json() as Promise<T>;
}

/**
 * Returns the raw response so callers can inspect the status code
 * (e.g. to treat 404 as success in delete operations).
 */
export async function portainerDeleteRaw(path: string): Promise<Response> {
  return portainerFetch(path, { method: 'DELETE' });
}
