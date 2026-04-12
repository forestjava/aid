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

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly org: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      'Authorization': `token ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async createRepo(name: string): Promise<GiteaRepo> {
    const url = `${this.baseUrl}/api/v1/orgs/${this.org}/repos`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name,
        auto_init: true,
        default_branch: 'main',
        private: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gitea createRepo failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<GiteaRepo>;
  }

  async pushFiles(
    repoName: string,
    files: Map<string, string>,
    message: string,
  ): Promise<void> {
    for (const [filePath, content] of files) {
      const url = `${this.baseUrl}/api/v1/repos/${this.org}/${repoName}/contents/${filePath}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          message: `${message}: ${filePath}`,
          content: Buffer.from(content).toString('base64'),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Failed to push ${filePath}: ${res.status} ${body}`);
      }
    }
  }

  async deleteRepo(name: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/repos/${this.org}/${name}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Gitea deleteRepo failed (${res.status}): ${body}`);
    }
  }

  async repoExists(name: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/v1/repos/${this.org}/${name}`;
    const res = await fetch(url, { headers: this.headers() });
    return res.ok;
  }
}
