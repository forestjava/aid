import { config } from '../config.js';
import { npmGet, npmPost, npmDeleteRaw, NpmError } from './client.js';

interface ProxyHost {
  id: number;
  domain_names: string[];
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
}

export interface CreateProxyHostOptions {
  domain: string;
  forwardHost: string;
  forwardPort: number;
}

/**
 * Creates an NPM proxy host for the given domain pointing to a Docker container.
 * If NPM_WILDCARD_CERT_ID is set, that cert is reused; otherwise Let's Encrypt
 * is requested for the domain (takes 10–30 s).
 *
 * @returns The numeric NPM proxy host ID, needed for later cleanup.
 */
export async function createProxyHost(opts: CreateProxyHostOptions): Promise<{ id: number }> {
  const { domain, forwardHost, forwardPort } = opts;
  const certificateId = config.NPM_WILDCARD_CERT_ID ?? 'new';

  console.log(`[npm] Creating proxy host: ${domain} → ${forwardHost}:${forwardPort}`);

  const body = {
    domain_names: [domain],
    forward_scheme: 'http',
    forward_host: forwardHost,
    forward_port: forwardPort,
    access_list_id: 0,
    certificate_id: certificateId,
    ssl_forced: true,
    hsts_enabled: false,
    http2_support: true,
    block_exploits: true,
    caching_enabled: false,
    allow_websocket_upgrade: true,
    meta: {
      letsencrypt_email: 'admin@greact.ru',
      letsencrypt_agree: true,
      dns_challenge: false,
    },
    advanced_config: '',
    locations: [],
  };

  const result = await npmPost<ProxyHost>('/nginx/proxy-hosts', body);
  console.log(`[npm] Proxy host created: id=${result.id}, domain=${domain}`);
  return { id: result.id };
}

/**
 * Deletes an NPM proxy host by ID. Idempotent: 404 is treated as success.
 */
export async function deleteProxyHost(id: number): Promise<void> {
  console.log(`[npm] Deleting proxy host id=${id}`);
  const res = await npmDeleteRaw(`/nginx/proxy-hosts/${id}`);

  if (res.ok || res.status === 404) {
    console.log(`[npm] Proxy host ${id} deleted (status=${res.status})`);
    return;
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    // ignore
  }
  throw new NpmError(
    res.status,
    body,
    `NPM delete proxy host ${id} failed ${res.status}: ${body}`,
  );
}

/**
 * Finds a proxy host by exact domain name match. Returns null if not found.
 * Useful for cleanup by domain when the ID is unknown.
 */
export async function findProxyHostByDomain(domain: string): Promise<ProxyHost | null> {
  const hosts = await npmGet<ProxyHost[]>(
    '/nginx/proxy-hosts?expand=owner,access_list,certificate',
  );
  return hosts.find((h) => h.domain_names.includes(domain)) ?? null;
}
