import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let clientSig = '';

export function getBrowserSupabaseClient(
  url: string | null,
  publishableKey: string | null
): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  const sig = `${url}:${publishableKey}`;
  if (!client || clientSig !== sig) {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    clientSig = sig;
  }
  return client;
}
