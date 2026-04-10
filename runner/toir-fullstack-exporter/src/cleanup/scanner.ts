import { config } from '../config.js';
import { portainerGet } from '../portainer/client.js';
import { npmGet } from '../npm/client.js';

/**
 * Resource name pattern: gen-{yyyymmdd}-{8 hex chars}
 * Only resources matching this exact shape are eligible for cleanup.
 */
export const GEN_RESOURCE_REGEX = /^gen-(\d{8})-[a-f0-9]{8}$/;

export interface ExpiredGiteaRepo {
  owner: string;
  name: string;
  dateStr: string;
  ageDays: number;
}

export interface ExpiredPortainerStack {
  id: number;
  name: string;
  dateStr: string;
  ageDays: number;
}

export interface ExpiredNpmProxyHost {
  id: number;
  domain: string;
  dateStr: string;
  ageDays: number;
}

interface GiteaRepo {
  id: number;
  name: string;
  owner: { login: string };
}

interface PortainerStackRaw {
  Id: number;
  Name: string;
  EndpointId: number;
}

interface NpmProxyHostRaw {
  id: number;
  domain_names: string[];
}

/**
 * Parses the embedded yyyymmdd date from a gen-* resource name.
 * Returns null if the name does not match our pattern.
 */
function parseGenName(name: string): { dateStr: string; date: Date } | null {
  const match = GEN_RESOURCE_REGEX.exec(name);
  if (!match) return null;

  const dateStr = match[1];
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  return { dateStr, date };
}

function ageDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function getCutoff(ttlDays: number): Date {
  return new Date(Date.now() - ttlDays * 86_400_000);
}

/**
 * Fetches all repos for the configured Gitea bot user, paginating until done.
 */
async function listAllGiteaRepos(): Promise<GiteaRepo[]> {
  const username = config.GITEA_USERNAME!;
  const baseUrl = `${config.GITEA_BASE_URL}/api/v1`;
  const limit = 50;
  const all: GiteaRepo[] = [];

  for (let page = 1; ; page++) {
    const res = await fetch(
      `${baseUrl}/users/${username}/repos?page=${page}&limit=${limit}`,
      {
        headers: {
          Authorization: `token ${config.GITEA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gitea list repos failed ${res.status}: ${body}`);
    }
    const repos = (await res.json()) as GiteaRepo[];
    if (repos.length === 0) break;
    all.push(...repos);
    if (repos.length < limit) break;
  }

  return all;
}

export async function listExpiredGiteaRepos(ttlDays: number): Promise<ExpiredGiteaRepo[]> {
  const cutoff = getCutoff(ttlDays);
  const repos = await listAllGiteaRepos();
  const expired: ExpiredGiteaRepo[] = [];

  for (const repo of repos) {
    const parsed = parseGenName(repo.name);
    if (!parsed) continue;
    if (parsed.date < cutoff) {
      expired.push({
        owner: repo.owner.login,
        name: repo.name,
        dateStr: parsed.dateStr,
        ageDays: ageDays(parsed.date),
      });
    }
  }

  return expired;
}

export async function listExpiredPortainerStacks(
  ttlDays: number,
): Promise<ExpiredPortainerStack[]> {
  const cutoff = getCutoff(ttlDays);
  const endpointId = config.PORTAINER_ENDPOINT_ID!;
  const stacks = await portainerGet<PortainerStackRaw[]>('/stacks');
  const expired: ExpiredPortainerStack[] = [];

  for (const stack of stacks) {
    if (stack.EndpointId !== endpointId) continue;
    const parsed = parseGenName(stack.Name);
    if (!parsed) continue;
    if (parsed.date < cutoff) {
      expired.push({
        id: stack.Id,
        name: stack.Name,
        dateStr: parsed.dateStr,
        ageDays: ageDays(parsed.date),
      });
    }
  }

  return expired;
}

export async function listExpiredNpmProxyHosts(
  ttlDays: number,
): Promise<ExpiredNpmProxyHost[]> {
  const cutoff = getCutoff(ttlDays);
  const suffix = `.${config.PUBLIC_DOMAIN_SUFFIX}`;
  const hosts = await npmGet<NpmProxyHostRaw[]>(
    '/nginx/proxy-hosts?expand=owner,access_list,certificate',
  );
  const expired: ExpiredNpmProxyHost[] = [];

  for (const host of hosts) {
    for (const domain of host.domain_names) {
      // Domain shape: gen-{date}-{hash}.{PUBLIC_DOMAIN_SUFFIX}
      if (!domain.endsWith(suffix)) continue;
      const label = domain.slice(0, -suffix.length);
      const parsed = parseGenName(label);
      if (!parsed) continue;
      if (parsed.date < cutoff) {
        expired.push({
          id: host.id,
          domain,
          dateStr: parsed.dateStr,
          ageDays: ageDays(parsed.date),
        });
      }
      break;
    }
  }

  return expired;
}
