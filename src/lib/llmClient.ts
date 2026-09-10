/**
 * Experiential Gateway LLM Client
 * Routes requests for 'gpt-6-astra' through the Experiential API gateway.
 */

export const EXPERIENTIAL_BASE_URL = 
  import.meta.env?.VITE_EXPLABS_BASE_URL || 
  'https://api.experientiallabs.ai/v1';

export const EXPERIENTIAL_API_KEY = 
  import.meta.env?.VITE_EXPLABS_API_KEY || 
  '';

export const EXPERIENTIAL_DEFAULT_MODEL = 'gpt-6-astra';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  stream?: boolean;
}

export async function createChatCompletion(options: ChatCompletionOptions) {
  const apiKey = EXPERIENTIAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing EXPLABS_API_KEY. Please set EXPLABS_API_KEY in your environment or Settings -> API Keys.'
    );
  }

  const response = await fetch(`${EXPERIENTIAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || EXPERIENTIAL_DEFAULT_MODEL,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream: options.stream ?? false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Experiential API request failed with status ${response.status}`);
  }

  return data;
}
