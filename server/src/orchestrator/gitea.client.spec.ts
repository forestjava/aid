// server/src/orchestrator/gitea.client.spec.ts
import { GiteaClient } from './gitea.client';

describe('GiteaClient', () => {
  let client: GiteaClient;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    client = new GiteaClient('http://gitea:3000', 'test-token', 'greact');
    mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('createRepo', () => {
    it('should POST to /api/v1/orgs/{org}/repos', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, name: 'test-project', html_url: 'http://gitea:3000/greact/test-project' }),
      });

      const result = await client.createRepo('test-project');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://gitea:3000/api/v1/orgs/greact/repos',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'token test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result.name).toBe('test-project');
    });
  });

  describe('pushFiles', () => {
    it('should POST files via contents API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: {} }),
      });

      const files = new Map<string, string>();
      files.set('README.md', '# Test');
      files.set('src/index.ts', 'console.log("hello")');

      await client.pushFiles('test-project', files, 'initial commit');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteRepo', () => {
    it('should DELETE /api/v1/repos/{org}/{name}', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await client.deleteRepo('test-project');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://gitea:3000/api/v1/repos/greact/test-project',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
