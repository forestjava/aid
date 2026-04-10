import { config } from '../config.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface ChatResponse {
  choices?: {
    message?: { content?: string };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: { message?: string };
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResult {
  content: string;
  usage: LLMUsage | null;
}

export interface CallLLMOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional label for log lines, e.g. "prisma". */
  label?: string;
}

/**
 * OpenAI-compatible chat completions client. Targets OpenRouter by default
 * via AI_API_URL/AI_API_KEY/AI_MODEL from env.
 */
export async function callLLM(opts: CallLLMOptions): Promise<LLMResult> {
  const maxTokens = opts.maxTokens ?? config.AI_MAX_TOKENS ?? 8000;
  const temperature = opts.temperature ?? config.AI_TEMPERATURE ?? 0.2;
  const label = opts.label ?? 'llm';

  const body: ChatRequest = {
    model: config.AI_MODEL,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  // Retry policy: up to 3 retries on HTTP 429 (rate limit) with exponential
  // backoff at 1s, 2s, 4s. All other failures (network, 5xx, 4xx≠429) bubble
  // up immediately — they almost always indicate a real problem with the
  // request, not a transient throttle.
  const backoffMs = [1000, 2000, 4000];
  let response: Response | undefined;
  let lastErrorBody = '';
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    response = await fetch(config.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 429) break;

    lastErrorBody = await response.text().catch(() => '');
    if (attempt === backoffMs.length) break;
    const delay = backoffMs[attempt];
    console.log(
      `[${label}] LLM API rate-limited (429). Retrying in ${delay}ms (attempt ${attempt + 1}/${backoffMs.length}).`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }

  if (!response) {
    throw new Error(`[${label}] LLM API call produced no response`);
  }

  if (!response.ok) {
    const errorBody = lastErrorBody || (await response.text().catch(() => ''));
    throw new Error(
      `[${label}] LLM API error ${response.status} ${response.statusText}: ${errorBody}`,
    );
  }

  const data = (await response.json()) as ChatResponse;

  if (data.error) {
    throw new Error(`[${label}] LLM API returned error: ${JSON.stringify(data.error)}`);
  }

  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new Error(
      `[${label}] Empty response from LLM API: ${JSON.stringify(data).slice(0, 500)}`,
    );
  }

  const finishReason = choice?.finish_reason;
  if (finishReason && finishReason !== 'stop' && finishReason !== 'end_turn') {
    console.warn(
      `[${label}] LLM response truncated (finish_reason=${finishReason}, requested max_tokens=${maxTokens}). Response may be incomplete.`,
    );
    throw new Error(
      `[${label}] LLM response truncated: finish_reason="${finishReason}". ` +
        `The model could not complete its output within ${maxTokens} max_tokens. ` +
        `Increase AI_MAX_TOKENS or reduce prompt complexity.`,
    );
  }

  const usage = data.usage ?? null;
  if (usage) {
    console.log(
      `[${label}] LLM tokens — prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`,
    );
  } else {
    console.log(`[${label}] LLM call complete (no usage stats returned)`);
  }

  return { content, usage };
}

/**
 * Strips a single fenced code block (```lang ... ```) and returns its inner
 * contents. If no fence is present, returns the input trimmed.
 */
export function extractCodeBlock(raw: string, lang?: string): string {
  const pattern = lang
    ? new RegExp('```(?:' + lang + ')?\\s*\\n([\\s\\S]*?)```', 'i')
    : /```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)```/;
  const match = raw.match(pattern);
  if (match && match[1]) return match[1].trim();
  return raw.trim();
}
