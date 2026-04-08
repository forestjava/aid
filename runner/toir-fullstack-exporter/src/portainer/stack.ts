import { config } from '../config.js';
import { portainerFetch, portainerJson, PortainerError } from './client.js';

const ENDPOINT_ID = config.PORTAINER_ENDPOINT_ID!;

export interface PortainerStack {
  Id: number;
  Name: string;
  /** 1 = Active (running), 2 = Inactive */
  Status: number;
  EndpointId: number;
}

interface CreateStackBody {
  name: string;
  repositoryURL: string;
  repositoryReferenceName: string;
  composeFile: string;
  repositoryAuthentication: boolean;
  repositoryUsername?: string;
  repositoryPassword?: string;
  env: Array<{ name: string; value: string }>;
}

/**
 * Creates a standalone Docker stack in Portainer by cloning a git repository.
 *
 * @param name        Stack name (must be unique on the endpoint)
 * @param repoUrl     Git repo URL without embedded credentials
 * @param branch      Full ref name, e.g. "refs/heads/main" (default: "refs/heads/main")
 * @param gitUsername Username for private repo auth
 * @param gitToken    Password / personal access token for private repo auth
 */
export async function createStackFromRepo(opts: {
  name: string;
  repoUrl: string;
  branch?: string;
  gitUsername?: string;
  gitToken?: string;
}): Promise<PortainerStack> {
  const { name, repoUrl, branch = 'refs/heads/main', gitUsername, gitToken } = opts;

  console.log(`[portainer] Creating stack "${name}" from ${repoUrl}`);

  const body: CreateStackBody = {
    name,
    repositoryURL: repoUrl,
    repositoryReferenceName: branch,
    composeFile: 'docker-compose.yml',
    repositoryAuthentication: !!(gitUsername && gitToken),
    env: [],
  };

  if (gitUsername && gitToken) {
    body.repositoryUsername = gitUsername;
    body.repositoryPassword = gitToken;
  }

  const stack = await portainerJson<PortainerStack>(
    `/stacks/create/standalone/repository?endpointId=${ENDPOINT_ID}`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  console.log(`[portainer] Stack created: id=${stack.Id} status=${stack.Status}`);
  return stack;
}

/**
 * Polls GET /stacks/{id} until Status === 1 (Active) or timeout is exceeded.
 *
 * Uses exponential backoff: starts at 2 s, multiplies by 1.5 each round, caps at 30 s.
 *
 * @param stackId   Portainer stack ID
 * @param timeoutMs Maximum wait time in milliseconds (default: 10 minutes)
 */
export async function waitUntilRunning(
  stackId: number,
  timeoutMs = 10 * 60 * 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 2_000;
  const maxDelay = 30_000;

  console.log(`[portainer] Waiting for stack ${stackId} to become active (timeout: ${timeoutMs / 1000}s) ...`);

  while (Date.now() < deadline) {
    await sleep(delay);

    let stack: PortainerStack | null = null;

    try {
      stack = await portainerJson<PortainerStack>(`/stacks/${stackId}`);
    } catch (err) {
      if (err instanceof PortainerError && err.status === 404) {
        // Stack not registered yet — keep polling
        console.log(`[portainer] Stack ${stackId} not found yet, retrying ...`);
      } else {
        throw err;
      }
    }

    if (stack !== null) {
      if (stack.Status === 1) {
        console.log(`[portainer] Stack ${stackId} is active`);
        return;
      }
      console.log(`[portainer] Stack ${stackId} status=${stack.Status}, retrying ...`);
    }

    delay = Math.min(delay * 1.5, maxDelay);
  }

  throw new Error(
    `[portainer] Stack ${stackId} did not become active within ${timeoutMs / 1000}s`,
  );
}

/**
 * Deletes a Portainer stack. Idempotent: a 404 response is silently ignored.
 */
export async function deleteStack(stackId: number): Promise<void> {
  console.log(`[portainer] Deleting stack ${stackId}`);

  try {
    await portainerFetch(
      `/stacks/${stackId}?endpointId=${ENDPOINT_ID}`,
      { method: 'DELETE' },
    );
    console.log(`[portainer] Stack ${stackId} deleted`);
  } catch (err) {
    if (err instanceof PortainerError && err.status === 404) {
      console.log(`[portainer] Stack ${stackId} already gone (404), skipping`);
      return;
    }
    throw err;
  }
}

/**
 * Lists all stacks on the configured endpoint whose names start with `prefix`.
 */
export async function listStacksByPrefix(prefix: string): Promise<PortainerStack[]> {
  const filters = JSON.stringify({ EndpointID: ENDPOINT_ID });
  const all = await portainerJson<PortainerStack[]>(
    `/stacks?filters=${encodeURIComponent(filters)}`,
  );
  return all.filter((s) => s.Name.startsWith(prefix));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
