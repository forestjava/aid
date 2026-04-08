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

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Raw fetch against Portainer API. Throws PortainerError for non-2xx responses,
 * unless the status is in `allowedStatuses`.
 */
export async function portainerFetch(
  path: string,
  options: RequestInit & { allowedStatuses?: number[] } = {},
): Promise<Response> {
  const { allowedStatuses, ...fetchOptions } = options;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers: {
      ...authHeaders(),
      ...(fetchOptions.headers as Record<string, string> | undefined),
    },
  });

  const ok = allowedStatuses
    ? allowedStatuses.includes(res.status)
    : res.ok;

  if (!ok) {
    const body = await readBody(res);
    throw new PortainerError(
      res.status,
      body,
      `Portainer API error ${res.status} ${res.statusText} on ${options.method ?? 'GET'} ${path}: ${body}`,
    );
  }

  return res;
}

/**
 * Fetch + parse JSON. Throws PortainerError for non-2xx.
 */
export async function portainerJson<T>(
  path: string,
  options: RequestInit & { allowedStatuses?: number[] } = {},
): Promise<T> {
  const res = await portainerFetch(path, options);
  return res.json() as Promise<T>;
}
