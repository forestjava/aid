import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parse, stringify, isMap, isSeq, YAMLMap, YAMLSeq } from 'yaml';
import { config } from '../config.js';

export interface PostProcessResult {
  applied: boolean;
  reason?: string;
  postgresPassword?: string;
  jwtSecret?: string;
}

interface PostProcessOptions {
  slug: string;
  /** Service that should be exposed to the external/public network. */
  publicService?: string;
  /** Service that runs PostgreSQL. */
  postgresService?: string;
  /** Service that runs the backend application. */
  backendService?: string;
}

/**
 * Deterministically post-processes `docker-compose.yml` inside the working
 * directory so the generated stack is deployable through Portainer behind a
 * shared reverse-proxy network. Mutations:
 *
 * 1. Inject `container_name: ${slug}-${serviceName}` per service
 * 2. Strip top-level `ports:` host bindings
 * 3. Add a stack-internal network and attach the external proxy network
 * 4. Public-facing service joins both networks; others only the internal one
 * 5. Generate POSTGRES_PASSWORD and JWT_SECRET via crypto.randomBytes
 * 6. Wire DATABASE_URL through the renamed postgres container hostname
 */
export async function postProcessCompose(
  workingDir: string,
  opts: PostProcessOptions,
): Promise<PostProcessResult> {
  const composePath = path.join(workingDir, 'docker-compose.yml');
  const exists = await fs
    .stat(composePath)
    .then((s) => s.isFile())
    .catch(() => false);

  if (!exists) {
    return { applied: false, reason: 'docker-compose.yml not present (LLM stages stubbed)' };
  }

  const raw = await fs.readFile(composePath, 'utf8');
  const doc = parse(raw) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') {
    return { applied: false, reason: 'docker-compose.yml is empty or invalid' };
  }

  const services = (doc as Record<string, unknown>).services as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!services) {
    return { applied: false, reason: 'docker-compose.yml has no services block' };
  }

  const slug = opts.slug;
  const internalNet = `${slug}_internal`;
  const externalNet = config.PORTAINER_EXTERNAL_NETWORK;

  const publicService = opts.publicService ?? pickService(services, ['client', 'frontend', 'web']);
  const postgresService = opts.postgresService ?? pickService(services, ['postgres', 'db']);
  const backendService = opts.backendService ?? pickService(services, ['server', 'backend', 'api']);

  const postgresPassword = randomBytes(24).toString('hex');
  const jwtSecret = randomBytes(32).toString('hex');

  for (const [serviceName, serviceRaw] of Object.entries(services)) {
    const service = (serviceRaw ?? {}) as Record<string, unknown>;
    service.container_name = `${slug}-${serviceName}`;
    delete service.ports;

    const isPublic = serviceName === publicService;
    service.networks = isPublic ? [internalNet, externalNet] : [internalNet];

    if (serviceName === postgresService) {
      service.environment = mergeEnv(service.environment, {
        POSTGRES_PASSWORD: postgresPassword,
      });
    }

    if (serviceName === backendService) {
      const dbHost = postgresService ? `${slug}-${postgresService}` : `${slug}-postgres`;
      service.environment = mergeEnv(service.environment, {
        JWT_SECRET: jwtSecret,
        POSTGRES_PASSWORD: postgresPassword,
        DATABASE_URL: `postgresql://postgres:${postgresPassword}@${dbHost}:5432/toir`,
      });
    }

    services[serviceName] = service;
  }

  (doc as Record<string, unknown>).networks = {
    [internalNet]: { driver: 'bridge' },
    [externalNet]: { external: true },
  };

  await fs.writeFile(composePath, stringify(doc), 'utf8');

  return { applied: true, postgresPassword, jwtSecret };
}

function pickService(
  services: Record<string, unknown>,
  candidates: string[],
): string | undefined {
  for (const name of candidates) {
    if (name in services) return name;
  }
  return undefined;
}

/**
 * Merge a flat object of key/value env entries into a service's `environment`
 * field, preserving the existing form (object map or `KEY=value` array).
 */
function mergeEnv(
  current: unknown,
  additions: Record<string, string>,
): Record<string, string> | string[] {
  if (Array.isArray(current)) {
    const out = [...(current as string[])];
    const seen = new Set(
      out
        .map((line) => line.split('=', 1)[0])
        .filter((k): k is string => typeof k === 'string'),
    );
    for (const [key, value] of Object.entries(additions)) {
      const line = `${key}=${value}`;
      if (seen.has(key)) {
        const idx = out.findIndex((entry) => entry.startsWith(`${key}=`));
        out[idx] = line;
      } else {
        out.push(line);
      }
    }
    return out;
  }

  const obj: Record<string, string> =
    current && typeof current === 'object' ? { ...(current as Record<string, string>) } : {};
  for (const [key, value] of Object.entries(additions)) {
    obj[key] = value;
  }
  return obj;
}

// Silence unused-import warnings — these are kept for future structural edits.
void isMap;
void isSeq;
void YAMLMap;
void YAMLSeq;
