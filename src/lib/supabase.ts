import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let clientSig = '';

export function getBrowserSupabaseClient(
  url: string | null,
  publishableKey: string | null
): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  const isOAuthPopupCallback =
    typeof window !== 'undefined' &&
    Boolean(
      window.opener &&
        window.opener !== window &&
        window.location.pathname.startsWith('/auth/callback')
    );
  const sig = `${url}:${publishableKey}:${isOAuthPopupCallback ? 'popup' : 'main'}`;
  if (!client || clientSig !== sig) {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !isOAuthPopupCallback,
        flowType: 'pkce',
      },
    });
    clientSig = sig;
  }
  return client;
}
