export const OAUTH_RETURN_TO_KEY = 'ds_oauth_return_to';
export const OAUTH_PENDING_AGE18_KEY = 'ds_oauth_pending_age18';
export const OAUTH_MODE_KEY = 'ds_oauth_mode';

export interface ParsedOAuthError {
  code: string;
  message: string;
  isCancelled: boolean;
  isIdentityConflict: boolean;
}

export function sanitizeReturnPath(raw: string | null | undefined, fallback = '/dashboard?tab=account'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback;
  }
  if (trimmed.startsWith('/auth/callback')) {
    return fallback;
  }
  return trimmed;
}

export function extractOAuthParamsFromUrl(search: string, hash: string): {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  hasCode: boolean;
  hasAccessToken: boolean;
  mode: 'signin' | 'link';
} {
  const searchParams = new URLSearchParams(search || '');
  const hashRaw = hash.startsWith('#') ? hash.slice(1) : hash || '';
  const hashParams = new URLSearchParams(hashRaw);

  const error = searchParams.get('error') || hashParams.get('error');
  const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
  const errorDescription =
    searchParams.get('error_description') || hashParams.get('error_description');
  const hasCode = Boolean(searchParams.get('code'));
  const hasAccessToken = Boolean(hashParams.get('access_token'));
  const modeParam = searchParams.get('mode');
  const mode = modeParam === 'link' ? 'link' : 'signin';

  return {
    error,
    errorCode,
    errorDescription,
    hasCode,
    hasAccessToken,
    mode,
  };
}

export function classifyOAuthError(
  rawError: string | null,
  rawCode?: string | null,
  rawDescription?: string | null,
  mode: 'signin' | 'link' = 'signin'
): ParsedOAuthError {
  const combined = `${rawCode || ''} ${rawError || ''} ${rawDescription || ''}`.toLowerCase();

  if (
    combined.includes('access_denied') ||
    combined.includes('cancel') ||
    combined.includes('user_cancelled')
  ) {
    return {
      code: 'access_denied',
      isCancelled: true,
      isIdentityConflict: false,
      message:
        mode === 'link'
          ? 'Google connection was cancelled. Your current anonymous session remains untouched.'
          : 'Google sign-in was cancelled. You can try again or continue anonymously anytime.',
    };
  }

  if (
    combined.includes('identity_already_exists') ||
    combined.includes('already linked') ||
    combined.includes('already exists') ||
    combined.includes('already registered')
  ) {
    return {
      code: 'identity_already_exists',
      isCancelled: false,
      isIdentityConflict: true,
      message:
        mode === 'link'
          ? 'This Google account is already connected to an existing Dear Stranger account. Your anonymous letters were not modified or merged.'
          : 'This Google account already exists with a conflict. Please try signing in again.',
    };
  }

  if (combined.includes('manual_linking_disabled') || combined.includes('linking is disabled')) {
    return {
      code: 'manual_linking_disabled',
      isCancelled: false,
      isIdentityConflict: false,
      message:
        'Connecting Google to an existing anonymous session requires "Enable Manual Linking" in Supabase Authentication settings.',
    };
  }

  if (combined.includes('provider is not enabled') || combined.includes('unsupported_provider')) {
    return {
      code: 'provider_not_enabled',
      isCancelled: false,
      isIdentityConflict: false,
      message:
        'Google sign-in is not yet enabled in the connected Supabase project (Authentication -> Providers -> Google).',
    };
  }

  if (
    combined.includes('invalid') &&
    (combined.includes('state') || combined.includes('flow') || combined.includes('code'))
  ) {
    return {
      code: 'invalid_state',
      isCancelled: false,
      isIdentityConflict: false,
      message:
        'Your Google sign-in session expired or did not match this browser tab. Please start the sign-in flow again.',
    };
  }

  const cleanDetail = (rawDescription || rawError || '').trim();
  return {
    code: rawCode || rawError || 'oauth_error',
    isCancelled: false,
    isIdentityConflict: false,
    message:
      cleanDetail ||
      'Google authentication could not be completed. Please try again or continue anonymously.',
  };
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
