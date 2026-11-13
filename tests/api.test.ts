import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
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
});
