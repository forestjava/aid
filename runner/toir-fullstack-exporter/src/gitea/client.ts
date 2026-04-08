import { config } from '../config.js';

const BASE_URL = `${config.GITEA_BASE_URL}/api/v1`;

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `token ${config.GITEA_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function assertOk(res: Response, allowedStatuses?: number[]): Promise<void> {
  const allowed = allowedStatuses ?? [200, 201];
  if (!allowed.includes(res.status)) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Gitea API error ${res.status}: ${body}`);
  }
}

export async function createRepo(name: string): Promise<void> {
  console.log(`[gitea] Creating repo: ${name}`);

  const res = await fetch(`${BASE_URL}/user/repos`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name,
      private: true,
      auto_init: false,
      default_branch: 'main',
    }),
  });

  await assertOk(res, [201]);
  console.log(`[gitea] Repo created: ${name}`);
}

export async function deleteRepo(owner: string, name: string): Promise<void> {
  console.log(`[gitea] Deleting repo: ${owner}/${name}`);

  const res = await fetch(`${BASE_URL}/repos/${owner}/${name}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  // 204 = deleted, 404 = already gone — both are acceptable
  if (res.status !== 204 && res.status !== 404) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Gitea API error ${res.status}: ${body}`);
  }

  console.log(`[gitea] Repo deleted: ${owner}/${name}`);
}
