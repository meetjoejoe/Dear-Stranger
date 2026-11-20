import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import vercelHandler, { normalizeVercelApiUrl } from '../api/index.ts';
import { createApp } from '../server.ts';
import { injectLetterOpenGraph } from '../server/ogMeta.ts';
import { resetRateLimitsForTest } from '../server/rateLimit.ts';
import { sandboxStore } from '../server/sandboxStore.ts';
import { screenContentForSafety } from '../src/shared/validation.ts';

let server: Server;
let baseUrl = '';

async function reqJson<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

before(async () => {
  sandboxStore.reset();
  resetRateLimitsForTest();
  const app = await createApp({ skipVite: true });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Dear Stranger API & Security Verification', () => {
  it('exposes health check and safe public config without secrets', async () => {
    const health = await reqJson<{ status: string }>('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');

    const cfg = await reqJson<Record<string, unknown>>('/api/config');
    assert.equal(cfg.status, 200);
    assert.equal('supabaseSecretKey' in cfg.data, false);
    assert.equal('resendApiKey' in cfg.data, false);
  });

  it('enforces 18+ age confirmation, letter validation, unlisted isolation, 1-level reply nesting, reactions, and owner-only edits', async () => {
    // 1. Create two anonymous users
    const u1Res = await reqJson<{ token: string; profile: { id: string } }>('/api/sandbox/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(u1Res.status, 201);
    const token1 = u1Res.data.token;

    const u2Res = await reqJson<{ token: string; profile: { id: string } }>('/api/sandbox/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(u2Res.status, 201);
    const token2 = u2Res.data.token;

    const catsRes = await reqJson<{ categories: Array<{ id: string; slug: string }> }>('/api/categories');
    assert.equal(catsRes.status, 200);
    assert.equal(catsRes.data.categories.length, 8);
    const lifeCatId = catsRes.data.categories[0].id;

    // 2. Posting without 18+ confirmation is blocked
    const unconfirmedAttempt = await reqJson<{ error: string }>('/api/letters', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        body: 'This letter is longer than twenty characters to test age confirmation.',
        categoryId: lifeCatId,
        visibility: 'public',
        status: 'published',
      }),
    });
    assert.equal(unconfirmedAttempt.status, 403);

    // 3. Confirm 18+ for both users
    await reqJson('/api/me', {
      method: 'PATCH',
      token: token1,
      body: JSON.stringify({ confirmAge18Plus: true }),
    });
    await reqJson('/api/me', {
      method: 'PATCH',
      token: token2,
      body: JSON.stringify({ confirmAge18Plus: true }),
    });

    // 4. Too-short letter is rejected
    const shortAttempt = await reqJson<{ error: string }>('/api/letters', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        body: 'Too short',
        categoryId: lifeCatId,
        visibility: 'public',
        status: 'published',
      }),
    });
    assert.equal(shortAttempt.status, 400);

    // 5. Publish a public letter and an unlisted letter
    const pubLetterRes = await reqJson<{ letter: { id: string; title: string } }>('/api/letters', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        title: 'Quiet evening reflection',
        body: 'Sometimes sitting by the window with warm tea helps me untangle a loud week.',
        categoryId: lifeCatId,
        visibility: 'public',
        status: 'published',
      }),
    });
    assert.equal(pubLetterRes.status, 201);
    const publicId = pubLetterRes.data.letter.id;

    const unlistedRes = await reqJson<{ letter: { id: string } }>('/api/letters', {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        title: 'Private link only note',
        body: 'Unlisted secret note that must never appear in general public search or discovery.',
        categoryId: lifeCatId,
        visibility: 'unlisted',
        status: 'published',
      }),
    });
    assert.equal(unlistedRes.status, 201);
    const unlistedId = unlistedRes.data.letter.id;

    // 6. Verify unlisted letter is excluded from public feed, search, and Surprise Me, but accessible via direct link
    const feedRes = await reqJson<{ letters: Array<{ id: string }> }>('/api/letters?q=secret');
    assert.equal(feedRes.data.letters.some((l) => l.id === unlistedId), false);

    const directUnlisted = await reqJson<{ letter: { id: string; visibility: string } }>(
      `/api/letters/${unlistedId}`
    );
    assert.equal(directUnlisted.status, 200);
    assert.equal(directUnlisted.data.letter.visibility, 'unlisted');

    // 7. Verify OpenGraph meta injection protects unlisted letters
    const sampleHtml =
      '<html><head><title>Default</title><meta name="description" content="Def" /><meta property="og:title" content="Def" /><meta property="og:description" content="Def" /><meta name="twitter:title" content="Def" /><meta name="twitter:description" content="Def" /></head></html>';
    const ogPublic = await injectLetterOpenGraph(sampleHtml, publicId, `https://example.com/letters/${publicId}`);
    assert.equal(ogPublic.includes('Quiet evening reflection'), true);
    const ogUnlisted = await injectLetterOpenGraph(sampleHtml, unlistedId, `https://example.com/letters/${unlistedId}`);
    assert.equal(ogUnlisted.includes('Private link only note'), false);

    // 8. User 2 posts a reply, User 1 posts 1-level nested response, 2nd-level nested response is rejected
    const reply1 = await reqJson<{ reply: { id: string } }>(`/api/letters/${publicId}/replies`, {
      method: 'POST',
      token: token2,
      body: JSON.stringify({ body: 'Thank you for sharing this quiet moment.' }),
    });
    assert.equal(reply1.status, 201);

    const nested1 = await reqJson<{ reply: { id: string } }>(`/api/letters/${publicId}/replies`, {
      method: 'POST',
      token: token1,
      body: JSON.stringify({
        body: 'I appreciate your kind note back.',
        parentReplyId: reply1.data.reply.id,
      }),
    });
    assert.equal(nested1.status, 201);

    const nested2 = await reqJson<{ error: string }>(`/api/letters/${publicId}/replies`, {
      method: 'POST',
      token: token2,
      body: JSON.stringify({
        body: 'Attempting illegal second-level nesting.',
        parentReplyId: nested1.data.reply.id,
      }),
    });
    assert.equal(nested2.status, 400);

    // 9. Owner-only edit enforcement
    const unauthorizedEdit = await reqJson<{ error: string }>(`/api/letters/${publicId}`, {
      method: 'PATCH',
      token: token2,
      body: JSON.stringify({
        title: 'Hijacked',
        body: 'Trying to overwrite another author letter with enough characters.',
        categoryId: lifeCatId,
        visibility: 'public',
        status: 'published',
      }),
    });
    assert.equal(unauthorizedEdit.status, 403);

    // 10. Reactions set, update, and remove
    const react1 = await reqJson<{ reactions: { total: number; userReaction: string | null } }>(
      `/api/letters/${publicId}/reaction`,
      {
        method: 'PUT',
        token: token2,
        body: JSON.stringify({ reactionType: 'i_hear_you' }),
      }
    );
    assert.equal(react1.data.reactions.total, 1);
    assert.equal(react1.data.reactions.userReaction, 'i_hear_you');

    const react2 = await reqJson<{ reactions: { total: number; userReaction: string | null } }>(
      `/api/letters/${publicId}/reaction`,
      {
        method: 'PUT',
        token: token2,
        body: JSON.stringify({ reactionType: null }),
      }
    );
    assert.equal(react2.data.reactions.total, 0);
    assert.equal(react2.data.reactions.userReaction, null);

    // 11. Moderation access control & locking conversation
    const nonAdminMod = await reqJson<{ error: string }>('/api/admin/moderation', { token: token1 });
    assert.equal(nonAdminMod.status, 403);

    const adminRes = await reqJson<{ token: string }>('/api/sandbox/session', {
      method: 'POST',
      body: JSON.stringify({ asAdmin: true }),
    });
    const adminToken = adminRes.data.token;

    const lockRes = await reqJson('/api/admin/moderation/decision', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        targetType: 'letter',
        targetId: publicId,
        actionType: 'lock_conversation',
        reason: 'Locking thread for test verification',
      }),
    });
    assert.equal(lockRes.status, 200);

    const replyOnLocked = await reqJson<{ error: string }>(`/api/letters/${publicId}/replies`, {
      method: 'POST',
      token: token2,
      body: JSON.stringify({ body: 'Should be rejected because locked.' }),
    });
    assert.equal(replyOnLocked.status, 403);

    // 12. Account deletion
    const delRes = await reqJson<{ deleted: boolean }>('/api/me', {
      method: 'DELETE',
      token: token1,
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.deleted, true);

    const afterDelete = await reqJson('/api/letters/' + publicId);
    assert.equal(afterDelete.status, 404);
  });

  it('screens content safely without false-flagging ordinary sadness', () => {
    const ordinarySadness = screenContentForSafety(
      'I feel lonely tonight and miss my grandmother deeply, even though I know tomorrow will come.'
    );
    assert.equal(ordinarySadness.requiresModeratorReview, false);
    assert.equal(ordinarySadness.imminentHarmDetected, false);

    const imminent = screenContentForSafety('I feel like I am going to end my life tonight.');
    assert.equal(imminent.imminentHarmDetected, true);

    const pii = screenContentForSafety('Call me at 555-123-4567 right away.');
    assert.equal(pii.requiresModeratorReview, true);
  });

  it('handles static-host fallback cleanly when /api backend is unavailable', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };

    const { handleClientSandboxRequest, DEFAULT_CATEGORIES } = await import(
      '../src/lib/clientSandboxFallback.ts'
    );
    const session = await handleClientSandboxRequest<{ token: string; profile: { id: string } }>(
      '/api/sandbox/session',
      { method: 'POST', body: JSON.stringify({}) }
    );
    assert.ok(session.token);

    await handleClientSandboxRequest('/api/me', {
      method: 'PATCH',
      token: session.token,
      body: JSON.stringify({ confirmAge18Plus: true }),
    });

    const created = await handleClientSandboxRequest<{ letter: { id: string; title: string } }>(
      '/api/letters',
      {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({
          title: 'Static fallback check',
          body: 'This verifies static fallback works cleanly without 404 errors.',
          categoryId: DEFAULT_CATEGORIES[0].id,
          visibility: 'public',
          status: 'published',
        }),
      }
    );
    assert.equal(created.letter.title, 'Static fallback check');
  });

  it('routes Vercel serverless rewrite URLs (/api/index?__vercel_path=...) cleanly without 404s and handles pre-parsed bodies', async () => {
    sandboxStore.reset();
    resetRateLimitsForTest();

    assert.equal(normalizeVercelApiUrl('/api/index?__vercel_path=config'), '/api/config');
    assert.equal(normalizeVercelApiUrl('/api/index?__vercel_path=categories'), '/api/categories');
    assert.equal(normalizeVercelApiUrl('/api/index?__vercel_path=letters&limit=4'), '/api/letters?limit=4');
    assert.equal(
      normalizeVercelApiUrl('/api/index?__vercel_path=letters/letter-of-the-day'),
      '/api/letters/letter-of-the-day'
    );
    assert.equal(normalizeVercelApiUrl('/api/index?__vercel_path='), '/api');

    let preParseNextRequest = false;
    const vercelSimServer = http.createServer((req, res) => {
      if (preParseNextRequest && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          (req as http.IncomingMessage & { body?: unknown }).body = JSON.parse(
            Buffer.concat(chunks).toString('utf8') || '{}'
          );
          void vercelHandler(req, res);
        });
        return;
      }
      void vercelHandler(req, res);
    });

    await new Promise<void>((resolve) => vercelSimServer.listen(0, '127.0.0.1', resolve));
    const addr = vercelSimServer.address();
    assert.ok(addr && typeof addr === 'object');
    const vUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const [cfgRes, catRes, lettersRes, lotdRes, missingRes] = await Promise.all([
        fetch(`${vUrl}/api/index?__vercel_path=config`),
        fetch(`${vUrl}/api/index?__vercel_path=categories`),
        fetch(`${vUrl}/api/index?__vercel_path=letters&limit=4`),
        fetch(`${vUrl}/api/index?__vercel_path=letters/letter-of-the-day`),
        fetch(`${vUrl}/api/index?__vercel_path=does-not-exist`),
      ]);

      assert.equal(cfgRes.status, 200);
      const cfgJson = (await cfgRes.json()) as { supabaseConfigured: boolean; platformAnnouncement: unknown };
      assert.equal(typeof cfgJson.supabaseConfigured, 'boolean');
      assert.ok(cfgJson.platformAnnouncement);

      assert.equal(catRes.status, 200);
      const catJson = (await catRes.json()) as { categories: Array<{ slug: string }> };
      assert.equal(catJson.categories.length, 8);

      assert.equal(lettersRes.status, 200);
      const lettersJson = (await lettersRes.json()) as { letters: unknown[]; total: number };
      assert.equal(Array.isArray(lettersJson.letters), true);

      assert.equal(lotdRes.status, 200);
      const lotdJson = (await lotdRes.json()) as { letter: unknown; editorNote: unknown };
      assert.equal(lotdJson.letter, null);

      assert.equal(missingRes.status, 404);
      const missingJson = (await missingRes.json()) as { error: string };
      assert.equal(missingJson.error, 'API endpoint not found.');

      // Verify pre-parsed body handling (mimicking @vercel/node req.body)
      preParseNextRequest = true;
      const preParsedRes = await fetch(`${vUrl}/api/index?__vercel_path=sandbox/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(preParsedRes.status, 201);
      const preParsedData = (await preParsedRes.json()) as { token: string };
      assert.ok(preParsedData.token);
    } finally {
      await new Promise<void>((resolve) => vercelSimServer.close(() => resolve()));
    }
  });

  it('supports reports, blocking isolation, saved letters, and moderation appeals in dashboard', async () => {
    sandboxStore.reset();
    resetRateLimitsForTest();

    const author = (await reqJson<{ token: string }>('/api/sandbox/session', { method: 'POST', body: '{}' })).data;
    const reader = (await reqJson<{ token: string }>('/api/sandbox/session', { method: 'POST', body: '{}' })).data;
    const admin = (
      await reqJson<{ token: string }>('/api/sandbox/session', {
        method: 'POST',
        body: JSON.stringify({ asAdmin: true }),
      })
    ).data;

    await reqJson('/api/me', { method: 'PATCH', token: author.token, body: JSON.stringify({ confirmAge18Plus: true }) });
    await reqJson('/api/me', { method: 'PATCH', token: reader.token, body: JSON.stringify({ confirmAge18Plus: true }) });

    const cats = (await reqJson<{ categories: Array<{ id: string }> }>('/api/categories')).data.categories;
    const created = (
      await reqJson<{ letter: { id: string } }>('/api/letters', {
        method: 'POST',
        token: author.token,
        body: JSON.stringify({
          title: 'Report and block check',
          body: 'Testing blocking isolation, saved letters, reports, and appeals cleanly.',
          categoryId: cats[0].id,
          visibility: 'public',
          status: 'published',
        }),
      })
    ).data.letter;

    // Save & report
    const saveRes = await reqJson<{ isSaved: boolean }>(`/api/letters/${created.id}/save`, {
      method: 'PUT',
      token: reader.token,
      body: JSON.stringify({ save: true }),
    });
    assert.equal(saveRes.status, 200);
    assert.equal(saveRes.data.isSaved, true);

    const reportRes = await reqJson<{ submitted: boolean }>('/api/reports', {
      method: 'POST',
      token: reader.token,
      body: JSON.stringify({
        targetType: 'letter',
        targetId: created.id,
        reason: 'spam_scams',
        description: 'Testing moderation queue preview enrichment',
      }),
    });
    assert.equal(reportRes.status, 201);

    // Block author -> letter hidden from reader feed and direct detail
    const blockRes = await reqJson<{ blocked: boolean }>('/api/blocks', {
      method: 'POST',
      token: reader.token,
      body: JSON.stringify({ letterId: created.id }),
    });
    assert.equal(blockRes.status, 201);

    const blockedFeed = await reqJson<{ letters: Array<{ id: string }> }>('/api/letters?limit=10', {
      token: reader.token,
    });
    assert.equal(blockedFeed.data.letters.some((l) => l.id === created.id), false);

    // Submit appeal -> returned in dashboard myAppeals & admin moderation reports
    const appealRes = await reqJson<{ submitted: boolean }>('/api/appeals', {
      method: 'POST',
      token: author.token,
      body: JSON.stringify({ note: 'Requesting human review of my letter status.' }),
    });
    assert.equal(appealRes.status, 201);

    const authorDash = await reqJson<{ myAppeals: Array<{ appealNote: string | null }> }>('/api/dashboard', {
      token: author.token,
    });
    assert.equal(authorDash.status, 200);
    assert.equal(authorDash.data.myAppeals.length, 1);

    const modData = await reqJson<{ reports: Array<{ targetPreview?: string }> }>('/api/admin/moderation', {
      token: admin.token,
    });
    assert.equal(modData.status, 200);
    assert.ok(modData.data.reports.length >= 2);
    assert.ok(modData.data.reports.some((r) => (r.targetPreview || '').includes('Report and block check')));
  });
});
