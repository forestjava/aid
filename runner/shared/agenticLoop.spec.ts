import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAgenticLoop } from './agenticLoop.ts';
import type { ChatMessage, LLMResponse } from './agenticLoop.ts';
import { FILE_TOOL_SCHEMAS } from './fileTools.ts';

let workspace: string;

describe('agenticLoop', () => {
  before(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aid-al-'));
  });
  after(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('stops when LLM returns no tool_calls', async () => {
    let callCount = 0;
    const llm = async (): Promise<LLMResponse> => {
      callCount++;
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.equal(callCount, 1);
  });

  it('executes tool_calls and adds tool results to history', async () => {
    let step = 0;
    const observed: ChatMessage[][] = [];

    const llm = async (messages: ChatMessage[]): Promise<LLMResponse> => {
      observed.push([...messages]);
      step++;
      if (step === 1) {
        return {
          choices: [{
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'write_file', arguments: JSON.stringify({ path: 'a.txt', content: 'hi' }) },
              }],
            },
          }],
        };
      }
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.equal(step, 2);
    const secondCallMessages = observed[1];
    const toolMsg = secondCallMessages.find(m => m.role === 'tool');
    assert.ok(toolMsg, 'tool message must be present in second call');
    assert.equal(toolMsg!.tool_call_id, 'call_1');
    const written = await fs.readFile(path.join(workspace, 'a.txt'), 'utf-8');
    assert.equal(written, 'hi');
  });

  it('stops at maxIterations and throws', async () => {
    const llm = async (): Promise<LLMResponse> => ({
      choices: [{
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_x',
            type: 'function',
            function: { name: 'list_files', arguments: JSON.stringify({ dir: '.' }) },
          }],
        },
      }],
    });

    await assert.rejects(
      () => runAgenticLoop({
        systemPrompt: 'sys',
        userPrompt: 'user',
        workspacePath: workspace,
        tools: FILE_TOOL_SCHEMAS,
        callLLM: llm,
        maxIterations: 3,
      }),
      /Max iterations/,
    );
  });

  it('reports tool errors back to LLM instead of throwing', async () => {
    let step = 0;
    let toolResultSeen: string | undefined;
    const llm = async (messages: ChatMessage[]): Promise<LLMResponse> => {
      step++;
      if (step === 1) {
        return {
          choices: [{
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_e',
                type: 'function',
                function: { name: 'read_file', arguments: JSON.stringify({ path: 'missing.txt' }) },
              }],
            },
          }],
        };
      }
      const toolMsg = messages.find(m => m.role === 'tool');
      toolResultSeen = toolMsg?.content as string;
      return {
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'done' },
        }],
      };
    };

    await runAgenticLoop({
      systemPrompt: 'sys',
      userPrompt: 'user',
      workspacePath: workspace,
      tools: FILE_TOOL_SCHEMAS,
      callLLM: llm,
    });
    assert.ok(toolResultSeen?.includes('error'), `expected error in tool result, got: ${toolResultSeen}`);
  });
});
