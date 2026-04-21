import { executeTool } from './fileTools.ts';
import type { FileToolSchema } from './fileTools.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  choices: Array<{
    index: number;
    finish_reason: string;
    message: ChatMessage;
  }>;
}

export type CallLLMFn = (messages: ChatMessage[], tools: FileToolSchema[]) => Promise<LLMResponse>;

export interface AgenticLoopOptions {
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;
  tools: FileToolSchema[];
  callLLM: CallLLMFn;
  maxIterations?: number;
  onProgress?: (msg: string) => void;
}

export async function runAgenticLoop(opts: AgenticLoopOptions): Promise<void> {
  const max = opts.maxIterations ?? 50;
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.userPrompt },
  ];

  for (let iter = 0; iter < max; iter++) {
    const response = await opts.callLLM(messages, opts.tools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error('LLM returned no choices');

    messages.push(choice.message);

    const toolCalls = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return;

    for (const call of toolCalls) {
      opts.onProgress?.(`Tool: ${call.function.name}`);
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        result = await executeTool(call.function.name, args, opts.workspacePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { error: message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Max iterations (${max}) reached without LLM stopping`);
}
