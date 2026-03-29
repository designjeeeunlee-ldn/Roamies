import { GROQ_API_KEY } from './config';

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string };

export async function askClaude(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 1024,
  _retries = 2,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('Groq API key missing. Add EXPO_PUBLIC_GROQ_API_KEY to .env.local and restart Expo.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (res.status === 429 && _retries > 0) {
    await new Promise((r) => setTimeout(r, 4000));
    return askClaude(system, messages, maxTokens, _retries - 1);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}
