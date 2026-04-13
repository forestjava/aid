import { Injectable, Logger } from '@nestjs/common';

interface PortainerStack {
  Id: number;
  Name: string;
  Status: number;
  EndpointId: number;
}

@Injectable()
export class PortainerClient {
  private readonly logger = new Logger(PortainerClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly endpointId: number,
  ) {}

  private headers(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async deployStack(name: string, composeContent: string): Promise<PortainerStack> {
    const url = `${this.baseUrl}/api/stacks/create/standalone/string?endpointId=${this.endpointId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ Name: name, StackFileContent: composeContent }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Portainer deployStack failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<PortainerStack>;
  }

  async removeStack(stackId: number): Promise<void> {
    const url = `${this.baseUrl}/api/stacks/${stackId}?endpointId=${this.endpointId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Portainer removeStack failed (${res.status}): ${body}`);
    }
  }

  async getStackByName(name: string): Promise<PortainerStack | null> {
    const url = `${this.baseUrl}/api/stacks`;
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      throw new Error(`Portainer getStacks failed (${res.status})`);
    }

    const stacks = (await res.json()) as PortainerStack[];
    return stacks.find((s) => s.Name === name) ?? null;
  }
}
