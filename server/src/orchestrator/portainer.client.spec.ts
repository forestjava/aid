import { PortainerClient } from './portainer.client';

describe('PortainerClient', () => {
  let client: PortainerClient;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    client = new PortainerClient('http://portainer:9000', 'test-token', 1);
    mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('deployStack', () => {
    it('should POST to /api/stacks/create/standalone/string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Id: 42, Name: 'test-stack' }),
      });

      const result = await client.deployStack('test-stack', 'services:\n  app:\n    image: nginx');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/stacks/create/standalone/string'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.Id).toBe(42);
    });
  });

  describe('removeStack', () => {
    it('should DELETE /api/stacks/{id}', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await client.removeStack(42);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/stacks/42'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('getStackByName', () => {
    it('should find stack by name from list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { Id: 1, Name: 'other' },
          { Id: 2, Name: 'test-stack' },
        ],
      });

      const result = await client.getStackByName('test-stack');
      expect(result?.Id).toBe(2);
    });

    it('should return null if not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Id: 1, Name: 'other' }],
      });

      const result = await client.getStackByName('missing');
      expect(result).toBeNull();
    });
  });
});
