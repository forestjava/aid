import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeTool } from './fileTools.ts';

let workspace: string;

describe('fileTools', () => {
  before(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aid-ft-'));
    await fs.mkdir(path.join(workspace, 'backend', 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'backend', 'src', 'hello.ts'), 'export const x = 1;');
  });

  after(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('list_files returns entries with type', async () => {
    const result = await executeTool('list_files', { dir: 'backend/src' }, workspace) as Array<{ name: string; type: string }>;
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'hello.ts');
    assert.equal(result[0].type, 'file');
  });

  it('read_file returns content', async () => {
    const result = await executeTool('read_file', { path: 'backend/src/hello.ts' }, workspace) as { content: string };
    assert.equal(result.content, 'export const x = 1;');
  });

  it('write_file creates missing directories', async () => {
    await executeTool('write_file', { path: 'backend/src/new/deep/file.ts', content: 'ok' }, workspace);
    const content = await fs.readFile(path.join(workspace, 'backend/src/new/deep/file.ts'), 'utf-8');
    assert.equal(content, 'ok');
  });

  it('write_file blocks path traversal', async () => {
    await assert.rejects(
      () => executeTool('write_file', { path: '../escape.txt', content: 'x' }, workspace),
      /Path traversal/,
    );
  });

  it('read_file blocks path traversal', async () => {
    await assert.rejects(
      () => executeTool('read_file', { path: '../../etc/passwd' }, workspace),
      /Path traversal/,
    );
  });

  it('unknown tool throws', async () => {
    await assert.rejects(
      () => executeTool('rm_rf', {}, workspace),
      /Unknown tool/,
    );
  });
});
