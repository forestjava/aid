// server/src/orchestrator/gitea.client.ts
import { Injectable, Logger } from '@nestjs/common';

interface GiteaRepo {
  id: number;
  name: string;
  html_url: string;
  clone_url: string;
}

@Injectable()
export class GiteaClient {
  private readonly logger = new Logger(GiteaClient.name);
  private owner: string;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly org: string,
  ) {
    this.owner = org;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `token ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async createRepo(name: string): Promise<GiteaRepo> {
    const body = JSON.stringify({
      name,
      auto_init: true,
      default_branch: 'main',
      private: false,
    });

    // Try org endpoint first
    const orgUrl = `${this.baseUrl}/api/v1/orgs/${this.org}/repos`;
    const orgRes = await fetch(orgUrl, {
      method: 'POST',
      headers: this.headers(),
      body,
    });

    if (orgRes.ok) {
      const repo = await orgRes.json() as GiteaRepo;
      this.owner = this.org;
      return repo;
    }

    // Fallback to user endpoint (doesn't require write:organization scope)
    if (orgRes.status === 403) {
      this.logger.warn('No write:organization scope, falling back to user repos');
      const userUrl = `${this.baseUrl}/api/v1/user/repos`;
      const userRes = await fetch(userUrl, {
        method: 'POST',
        headers: this.headers(),
        body,
      });

      if (userRes.ok) {
        const repo = await userRes.json() as GiteaRepo;
        // Extract owner from html_url: https://git.greact.ru/username/repo
        const match = repo.html_url.match(/\/([^/]+)\/[^/]+\/?$/);
        this.owner = match ? match[1] : this.org;
        return repo;
      }

      const errBody = await userRes.text();
      throw new Error(`Gitea createRepo (user) failed (${userRes.status}): ${errBody}`);
    }

    const errBody = await orgRes.text();
    throw new Error(`Gitea createRepo failed (${orgRes.status}): ${errBody}`);
  }

  async pushFiles(
    repoName: string,
    files: Map<string, string>,
    message: string,
  ): Promise<void> {
    for (const [filePath, content] of files) {
      const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${repoName}/contents/${filePath}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          message: `${message}: ${filePath}`,
          content: Buffer.from(content).toString('base64'),
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        this.logger.warn(`Failed to push ${filePath}: ${res.status} ${errBody}`);
      }
    }
  }

  async deleteRepo(name: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/repos/${this.owner}/${name}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!res.ok && res.status !== 404) {
      const errBody = await res.text();
      throw new Error(`Gitea deleteRepo failed (${res.status}): ${errBody}`);
    }
  }

  async repoExists(name: string): Promise<boolean> {
    // Check org first, then authenticated user
    const orgUrl = `${this.baseUrl}/api/v1/repos/${this.org}/${name}`;
    const orgRes = await fetch(orgUrl, { headers: this.headers() });
    if (orgRes.ok) {
      this.owner = this.org;
      return true;
    }

    // Check user's own repos
    const userUrl = `${this.baseUrl}/api/v1/repos/${await this.getUsername()}/${name}`;
    const userRes = await fetch(userUrl, { headers: this.headers() });
    if (userRes.ok) {
      this.owner = await this.getUsername();
      return true;
    }

    return false;
  }

  private usernameCache: string | null = null;

  private async getUsername(): Promise<string> {
    if (this.usernameCache) return this.usernameCache;
    const res = await fetch(`${this.baseUrl}/api/v1/user`, { headers: this.headers() });
    if (res.ok) {
      const data = await res.json() as { login: string };
      this.usernameCache = data.login;
      return data.login;
    }
    return this.org; // fallback
  }
}
