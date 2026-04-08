import { config } from '../config.js';
import { portainerGet, portainerPost, portainerDeleteRaw, PortainerError } from './client.js';

const ENDPOINT_ID = config.PORTAINER_ENDPOINT_ID!;

// Portainer stack status: 1=running (Active in UI), 2=stopped (Inactive in UI)
const STATUS_RUNNING = 1;
const STATUS_STOPPED = 2;

interface PortainerStack {
  Id: number;
  Name: string;
  Status: number;
  EndpointId: number;
}

interface CreateStackResponse {
  Id: number;
  Name: string;
}

export interface CreateStackOptions {
  name: string;
  repoUrl: string;
  gitToken: string;
  gitUsername?: string;
  branch?: string;
}

/**
 * Creates a standalone Docker Compose stack by telling Portainer to clone
 * the given private Gitea repo and run `docker compose up`.
 *
 * @returns The numeric Portainer stack ID.
 * @throws If name conflicts (409), throws with a clear message.
 */
export async function createStackFromRepo(opts: CreateStackOptions): Promise<number> {
  const {
    name,
    repoUrl,
    gitToken,
    gitUsername = 'toir-bot',
    branch = 'refs/heads/main',
  } = opts;

  console.log(`[portainer] Creating stack "${name}" from repo ${repoUrl}`);
  // gitToken is intentionally not logged

  const body = {
    name,
    repositoryURL: repoUrl,
    repositoryReferenceName: branch,
    repositoryAuthentication: true,
    repositoryUsername: gitUsername,
    repositoryPassword: gitToken,
    composeFile: 'docker-compose.yml',
  };

  let result: CreateStackResponse;
  try {
    result = await portainerPost<CreateStackResponse>(
      `/stacks/create/standalone/repository?endpointId=${ENDPOINT_ID}`,
      body,
    );
  } catch (err) {
    if (err instanceof PortainerError && err.status === 409) {
      throw new Error(
        `Stack name conflict: "${name}" already exists in Portainer. Use a unique slug.`,
      );
    }
    throw err;
  }

  console.log(`[portainer] Stack created: id=${result.Id}, name=${result.Name}`);
  return result.Id;
}

/**
 * Polls GET /api/stacks/{id} until status==1 (running).
 * Throws on status==2 (stopped/error) or timeout.
 *
 * @param stackId   Portainer stack ID returned by createStackFromRepo.
 * @param timeoutMs Maximum time to wait in ms (default: 10 minutes).
 */
export async function waitUntilRunning(stackId: number, timeoutMs = 600_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL_MS = 5_000;

  console.log(
    `[portainer] Waiting for stack ${stackId} to reach running state (timeout: ${timeoutMs / 1000}s)...`,
  );

  // Initial delay — Portainer needs time to clone the repo and pull images.
  await sleep(POLL_INTERVAL_MS);

  while (Date.now() < deadline) {
    const stack = await portainerGet<PortainerStack>(`/stacks/${stackId}`);

    if (stack.Status === STATUS_RUNNING) {
      console.log(`[portainer] Stack ${stackId} is running`);
      return;
    }

    if (stack.Status === STATUS_STOPPED) {
      throw new Error(
        `Stack ${stackId} ended up stopped (status=2). Check Portainer stack logs for errors.`,
      );
    }

    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(
      `[portainer] Stack ${stackId} status=${stack.Status}, polling... (${remaining}s left)`,
    );
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Stack ${stackId} did not reach running state within ${timeoutMs / 1000}s`,
  );
}

/**
 * Deletes a stack by ID. Idempotent: a 404 response is treated as success.
 */
export async function deleteStack(stackId: number): Promise<void> {
  console.log(`[portainer] Deleting stack ${stackId}`);

  const res = await portainerDeleteRaw(
    `/stacks/${stackId}?endpointId=${ENDPOINT_ID}&external=false`,
  );

  if (res.ok || res.status === 404) {
    console.log(`[portainer] Stack ${stackId} deleted (status=${res.status})`);
    return;
  }

  let body = '';
  try {
    body = await res.text();
  } catch {
    // ignore
  }
  throw new PortainerError(
    res.status,
    body,
    `Portainer delete stack ${stackId} failed ${res.status}: ${body}`,
  );
}

/**
 * Lists all stacks on the configured endpoint whose names start with `prefix`.
 */
export async function listStacksByPrefix(prefix: string): Promise<PortainerStack[]> {
  const filters = encodeURIComponent(JSON.stringify({ EndpointID: ENDPOINT_ID }));
  const all = await portainerGet<PortainerStack[]>(`/stacks?filters=${filters}`);
  return all.filter((s) => s.Name.startsWith(prefix));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
