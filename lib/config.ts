// ── Anthropic API key ─────────────────────────────────────────
// Replace with your key from https://console.anthropic.com
// For production, move this to a Supabase Edge Function so the key
// is never shipped in the client bundle.
export const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
