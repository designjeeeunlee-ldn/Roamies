import { ANTHROPIC_API_KEY } from './config';

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string };

export async function askClaude(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 600,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text ?? '').trim();
}
