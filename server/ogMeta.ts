import { getSupabaseAdminClient, isSupabaseConfigured } from './config.ts';
import { sandboxStore } from './sandboxStore.ts';

function escapeAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function injectLetterOpenGraph(
  html: string,
  letterId: string,
  canonicalUrl: string
): Promise<string> {
  let title = 'Dear Stranger — An Anonymous Letter';
  let description = 'Some things are easier to tell a stranger. Read and respond thoughtfully on Dear Stranger.';

  try {
    if (!isSupabaseConfigured()) {
      const found = sandboxStore.letters.find(
        (l) =>
          l.id === letterId &&
          l.visibility === 'public' &&
          (l.status === 'published' || l.status === 'locked') &&
          !l.deletedAt
      );
      if (found) {
        title = found.title ? `${found.title} — Dear Stranger` : 'An Anonymous Letter — Dear Stranger';
        description = found.body.slice(0, 155) + (found.body.length > 155 ? '…' : '');
      }
    } else {
      const admin = getSupabaseAdminClient();
      if (admin) {
        const { data } = await admin
          .from('letters')
          .select('title, body')
          .eq('id', letterId)
          .eq('visibility', 'public')
          .in('status', ['published', 'locked'])
          .is('deleted_at', null)
          .maybeSingle();
        if (data) {
          title = data.title ? `${data.title} — Dear Stranger` : 'An Anonymous Letter — Dear Stranger';
          description = data.body.slice(0, 155) + (data.body.length > 155 ? '…' : '');
        }
      }
    }
  } catch {
    // Fallback to generic metadata on error
  }

  const safeTitle = escapeAttr(title);
  const safeDesc = escapeAttr(description);
  const safeUrl = escapeAttr(canonicalUrl);

  return html
    .replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${safeDesc}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${safeTitle}" />`)
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${safeDesc}" />`
    )
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${safeTitle}" />`)
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${safeDesc}" />`
    )
    .replace('</head>', `  <meta property="og:url" content="${safeUrl}" />\n  </head>`);
}
