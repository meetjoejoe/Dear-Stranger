import type {
  CategoryDTO,
  LetterStatus,
  NotificationDTO,
  NotificationPreferencesDTO,
  ProfileDTO,
  PublicLetterDTO,
  ReactionSummary,
  ReactionType,
  ReplyDTO,
  ReportDTO,
} from '../shared/types.ts';
import { REACTION_TYPES } from '../shared/types.ts';
import {
  generateAnonymousNickname,
  letterInputSchema,
  nicknameSchema,
  replyInputSchema,
  reportInputSchema,
  screenContentForSafety,
} from '../shared/validation.ts';

const STORAGE_KEY = 'ds_ephemeral_static_preview_v1';

export const DEFAULT_CATEGORIES: CategoryDTO[] = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Life', slug: 'life', description: 'Everyday reflections, turning points, and quiet observations.', is_active: true, sort_order: 1 },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Relationships', slug: 'relationships', description: 'Love, friendship, heartbreak, boundaries, and human connection.', is_active: true, sort_order: 2 },
  { id: '11111111-1111-4111-8111-111111111103', name: 'Family', slug: 'family', description: 'Parents, siblings, heritage, duty, and domestic life.', is_active: true, sort_order: 3 },
  { id: '11111111-1111-4111-8111-111111111104', name: 'School & Career', slug: 'school-and-career', description: 'Ambition, burnout, uncertainty, studying, and work.', is_active: true, sort_order: 4 },
  { id: '11111111-1111-4111-8111-111111111105', name: 'Personal Growth', slug: 'personal-growth', description: 'Becoming yourself, letting go, habits, and inner change.', is_active: true, sort_order: 5 },
  { id: '11111111-1111-4111-8111-111111111106', name: 'Confessions', slug: 'confessions', description: 'Truths rarely spoken aloud, regrets, and unburdened secrets.', is_active: true, sort_order: 6 },
  { id: '11111111-1111-4111-8111-111111111107', name: 'Questions', slug: 'questions', description: 'Honest questions for strangers with different life experiences.', is_active: true, sort_order: 7 },
  { id: '11111111-1111-4111-8111-111111111108', name: 'Random Thoughts', slug: 'random-thoughts', description: 'Late-night ponderings, fragments, and passing wonder.', is_active: true, sort_order: 8 },
];

interface StoredLetter {
  id: string;
  authorId: string;
  title: string | null;
  body: string;
  categoryId: string;
  visibility: 'public' | 'unlisted';
  status: LetterStatus;
  allowExternalSharing: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  isSandboxSample?: boolean;
}

interface StoredReply {
  id: string;
  letterId: string;
  authorId: string;
  parentReplyId: string | null;
  body: string;
  status: 'published' | 'flagged_for_review' | 'removed';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface StaticPreviewState {
  profiles: Record<string, ProfileDTO>;
  tokens: Record<string, string>;
  categories: CategoryDTO[];
  letters: StoredLetter[];
  replies: StoredReply[];
  reactions: Array<{ letterId: string; userId: string; reactionType: ReactionType }>;
  saved: Array<{ letterId: string; userId: string }>;
  notifications: Array<NotificationDTO & { recipientId: string }>;
  preferences: Record<string, NotificationPreferencesDTO>;
  blocks: Array<{ id: string; blockerId: string; blockedId: string; createdAt: string }>;
  reports: ReportDTO[];
  letterOfTheDayId: string | null;
  announcement: { active: boolean; message: string };
  samplesLoaded: boolean;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadState(): StaticPreviewState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StaticPreviewState;
  } catch {
    // fallback to fresh state
  }
  return {
    profiles: {},
    tokens: {},
    categories: [...DEFAULT_CATEGORIES],
    letters: [],
    replies: [],
    reactions: [],
    saved: [],
    notifications: [],
    preferences: {},
    blocks: [],
    reports: [],
    letterOfTheDayId: null,
    announcement: { active: false, message: '' },
    samplesLoaded: false,
  };
}

function saveState(state: StaticPreviewState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function emptyReactions(userReaction: ReactionType | null = null): ReactionSummary {
  return {
    counts: {
      i_hear_you: 0,
      sending_strength: 0,
      i_understand: 0,
      made_me_smile: 0,
      thank_you: 0,
    },
    total: 0,
    userReaction,
  };
}

function formatLetter(state: StaticPreviewState, l: StoredLetter, viewerId: string | null): PublicLetterDTO {
  const cat = state.categories.find((c) => c.id === l.categoryId) || state.categories[0];
  const author = state.profiles[l.authorId];
  const replyCount = state.replies.filter(
    (r) => r.letterId === l.id && !r.deletedAt && r.status === 'published'
  ).length;
  const summary = emptyReactions();
  for (const r of state.reactions) {
    if (r.letterId === l.id && REACTION_TYPES.includes(r.reactionType)) {
      summary.counts[r.reactionType] += 1;
      summary.total += 1;
      if (viewerId && r.userId === viewerId) summary.userReaction = r.reactionType;
    }
  }
  return {
    id: l.id,
    title: l.title,
    body: l.body,
    category: { id: cat.id, name: cat.name, slug: cat.slug },
    authorDisplayName: author?.displayName || 'AnonymousStranger',
    visibility: l.visibility,
    status: l.status,
    allowExternalSharing: l.allowExternalSharing,
    language: 'en',
    publishedAt: l.publishedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    replyCount,
    reactions: summary,
    isOwner: Boolean(viewerId && l.authorId === viewerId),
    isSaved: Boolean(viewerId && state.saved.some((s) => s.letterId === l.id && s.userId === viewerId)),
    isSandboxSample: l.isSandboxSample,
  };
}

export class ClientFallbackError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function handleClientSandboxRequest<T>(
  pathWithQuery: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const state = loadState();
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, queryStr] = pathWithQuery.split('?');
  const params = new URLSearchParams(queryStr || '');
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {};
  const token = options.token || null;
  const userId = token ? state.tokens[token] || null : null;
  const profile = userId ? state.profiles[userId] || null : null;

  const requireAuth = (): ProfileDTO => {
    if (!profile) throw new ClientFallbackError(401, 'Please sign in anonymously to continue.');
    return profile;
  };

  if (pathname === '/api/config' && method === 'GET') {
    return {
      supabaseConfigured: false,
      supabaseUrl: null,
      supabasePublishableKey: null,
      turnstileSiteKey: null,
      emailConfigured: false,
      sandboxActive: true,
      sandboxHasSamples: state.samplesLoaded,
      platformAnnouncement: state.announcement,
      staticFallback: true,
    } as T;
  }

  if (pathname === '/api/categories' && method === 'GET') {
    return { categories: state.categories.filter((c) => c.is_active) } as T;
  }

  if (pathname === '/api/sandbox/session' && method === 'POST') {
    const id = uuid();
    const now = new Date().toISOString();
    const newProfile: ProfileDTO = {
      id,
      displayName: generateAnonymousNickname(),
      accountStatus: 'active',
      preferredTheme: 'light',
      preferredLanguage: 'en',
      ageConfirmedAt: null,
      isAnonymous: true,
      recoveryEmailLinked: false,
      restrictionReason: null,
      isAdmin: Boolean(body.asAdmin),
      adminRole: body.asAdmin ? 'admin' : null,
      createdAt: now,
    };
    const newToken = `sbx_local_${uuid()}`;
    state.profiles[id] = newProfile;
    state.tokens[newToken] = id;
    state.preferences[id] = {
      emailNotificationsEnabled: false,
      replyNotificationsEnabled: true,
      conversationNotificationsEnabled: true,
      marketingOptIn: false,
    };
    saveState(state);
    return { token: newToken, profile: newProfile } as T;
  }

  if (pathname === '/api/sandbox/samples' && method === 'POST') {
    if (!state.samplesLoaded) {
      const sampleAuthorId = '99999999-9999-4999-8999-999999999901';
      state.profiles[sampleAuthorId] = {
        id: sampleAuthorId,
        displayName: 'PaperMoon_14',
        accountStatus: 'active',
        preferredTheme: 'light',
        preferredLanguage: 'en',
        ageConfirmedAt: new Date().toISOString(),
        isAnonymous: true,
        recoveryEmailLinked: false,
        restrictionReason: null,
        isAdmin: false,
        adminRole: null,
        createdAt: new Date().toISOString(),
      };
      const now = new Date().toISOString();
      state.letters.unshift({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
        authorId: sampleAuthorId,
        title: '[Sandbox Sample] Learning to start over at thirty-two',
        body: 'I spent seven years building a career everyone admired, and last month I handed in my notice. Everyone wants a neat five-year plan, and the truth is I do not have one yet.',
        categoryId: state.categories[3]?.id || state.categories[0].id,
        visibility: 'public',
        status: 'published',
        allowExternalSharing: true,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        deletedAt: null,
        isSandboxSample: true,
      });
      state.samplesLoaded = true;
      saveState(state);
    }
    return { samplesLoaded: true } as T;
  }

  if (pathname === '/api/sandbox/reset' && method === 'POST') {
    sessionStorage.removeItem(STORAGE_KEY);
    return { reset: true } as T;
  }

  if (pathname === '/api/sandbox/toggle-admin' && method === 'POST') {
    const p = requireAuth();
    p.isAdmin = Boolean(body.enabled);
    p.adminRole = p.isAdmin ? 'admin' : null;
    saveState(state);
    return { profile: p } as T;
  }

  if (pathname === '/api/me') {
    if (method === 'GET') return { profile } as T;
    const p = requireAuth();
    if (method === 'PATCH') {
      if (typeof body.displayName === 'string') {
        const parsed = nicknameSchema.safeParse(body.displayName);
        if (!parsed.success) throw new ClientFallbackError(400, parsed.error.issues[0]?.message || 'Invalid nickname.');
        p.displayName = parsed.data;
      }
      if (body.preferredTheme === 'light' || body.preferredTheme === 'dark') {
        p.preferredTheme = body.preferredTheme;
      }
      if (body.confirmAge18Plus && !p.ageConfirmedAt) {
        p.ageConfirmedAt = new Date().toISOString();
      }
      if (typeof body.recoveryEmail === 'string' && body.recoveryEmail.trim()) {
        p.recoveryEmailLinked = true;
        p.isAnonymous = false;
      }
      saveState(state);
      return { profile: p } as T;
    }
    if (method === 'DELETE') {
      const now = new Date().toISOString();
      state.letters.forEach((l) => {
        if (l.authorId === p.id) l.deletedAt = now;
      });
      delete state.profiles[p.id];
      if (token) delete state.tokens[token];
      saveState(state);
      return { deleted: true } as T;
    }
  }

  if (pathname === '/api/letters' && method === 'GET') {
    const categorySlug = params.get('category');
    const q = (params.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, Number(params.get('page') || 1));
    const limit = Math.min(30, Math.max(1, Number(params.get('limit') || 12)));
    let items = state.letters.filter(
      (l) => l.visibility === 'public' && (l.status === 'published' || l.status === 'locked') && !l.deletedAt
    );
    if (categorySlug && categorySlug !== 'all') {
      const cat = state.categories.find((c) => c.slug === categorySlug);
      items = cat ? items.filter((l) => l.categoryId === cat.id) : [];
    }
    if (q) {
      items = items.filter((l) => `${l.title || ''} ${l.body}`.toLowerCase().includes(q));
    }
    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit).map((l) => formatLetter(state, l, userId));
    return { letters: paged, total, page, hasMore: page * limit < total } as T;
  }

  if (pathname === '/api/letters/surprise' && method === 'GET') {
    const exclude = new Set((params.get('exclude') || '').split(',').filter(Boolean));
    const eligible = state.letters.filter(
      (l) => l.visibility === 'public' && l.status === 'published' && !l.deletedAt
    );
    if (eligible.length === 0) return { letter: null } as T;
    const pool = eligible.filter((l) => !exclude.has(l.id));
    const chosen = (pool.length > 0 ? pool : eligible)[Math.floor(Math.random() * (pool.length || eligible.length))];
    return { letter: formatLetter(state, chosen, userId) } as T;
  }

  if (pathname === '/api/letters/open-letterbox' && method === 'GET') {
    const items = state.letters
      .filter((l) => l.visibility === 'public' && l.status === 'published' && !l.deletedAt)
      .map((l) => formatLetter(state, l, userId))
      .filter((l) => l.replyCount <= 2);
    return { letters: items } as T;
  }

  if (pathname === '/api/letters/letter-of-the-day' && method === 'GET') {
    const found = state.letterOfTheDayId
      ? state.letters.find((l) => l.id === state.letterOfTheDayId && !l.deletedAt)
      : null;
    return { letter: found ? formatLetter(state, found, userId) : null, editorNote: null } as T;
  }

  if (pathname === '/api/letters' && method === 'POST') {
    const p = requireAuth();
    if (!p.ageConfirmedAt) {
      throw new ClientFallbackError(403, 'Please confirm that you are 18 or older before participating.');
    }
    const parsed = letterInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ClientFallbackError(400, parsed.error.issues[0]?.message || 'Invalid letter.');
    }
    const safety = screenContentForSafety(`${parsed.data.title || ''}\n${parsed.data.body}`);
    const now = new Date().toISOString();
    const status: LetterStatus = parsed.data.status === 'draft' ? 'draft' : 'published';
    const created: StoredLetter = {
      id: uuid(),
      authorId: p.id,
      title: parsed.data.title,
      body: parsed.data.body,
      categoryId: parsed.data.categoryId,
      visibility: parsed.data.visibility,
      status,
      allowExternalSharing: parsed.data.allowExternalSharing,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === 'published' ? now : null,
      deletedAt: null,
    };
    state.letters.unshift(created);
    saveState(state);
    return {
      letter: formatLetter(state, created, p.id),
      safetyNotice: {
        imminentHarmDetected: safety.imminentHarmDetected,
        flaggedForReview: false,
      },
    } as T;
  }

  const letterMatch = pathname.match(/^\/api\/letters\/([^/]+)$/);
  if (letterMatch) {
    const letterId = letterMatch[1];
    const found = state.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!found) throw new ClientFallbackError(404, 'Letter not found.');

    if (method === 'GET') {
      const repliesRaw = state.replies.filter((r) => r.letterId === letterId && !r.deletedAt && r.status === 'published');
      const byId = new Map<string, ReplyDTO>();
      const top: ReplyDTO[] = [];
      for (const r of repliesRaw) {
        const dto: ReplyDTO = {
          id: r.id,
          letterId: r.letterId,
          parentReplyId: r.parentReplyId,
          authorDisplayName: state.profiles[r.authorId]?.displayName || 'AnonymousStranger',
          isLetterAuthor: r.authorId === found.authorId,
          isOwner: Boolean(userId && r.authorId === userId),
          body: r.body,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          children: [],
        };
        byId.set(dto.id, dto);
        if (!r.parentReplyId) top.push(dto);
      }
      for (const r of repliesRaw) {
        if (r.parentReplyId) {
          const parent = byId.get(r.parentReplyId);
          const child = byId.get(r.id);
          if (parent && child) parent.children.push(child);
        }
      }
      return { letter: formatLetter(state, found, userId), replies: top } as T;
    }

    if (method === 'PATCH') {
      const p = requireAuth();
      if (found.authorId !== p.id) throw new ClientFallbackError(403, 'You can only edit your own letters.');
      const parsed = letterInputSchema.safeParse(body);
      if (!parsed.success) throw new ClientFallbackError(400, parsed.error.issues[0]?.message || 'Invalid letter.');
      found.title = parsed.data.title;
      found.body = parsed.data.body;
      found.categoryId = parsed.data.categoryId;
      found.visibility = parsed.data.visibility;
      found.allowExternalSharing = parsed.data.allowExternalSharing;
      found.status = parsed.data.status;
      found.updatedAt = new Date().toISOString();
      if (found.status === 'published' && !found.publishedAt) found.publishedAt = found.updatedAt;
      saveState(state);
      return { letter: formatLetter(state, found, p.id) } as T;
    }

    if (method === 'DELETE') {
      const p = requireAuth();
      if (found.authorId !== p.id) throw new ClientFallbackError(403, 'You can only delete your own letters.');
      found.deletedAt = new Date().toISOString();
      saveState(state);
      return { deleted: true } as T;
    }
  }

  const replyCreateMatch = pathname.match(/^\/api\/letters\/([^/]+)\/replies$/);
  if (replyCreateMatch && method === 'POST') {
    const p = requireAuth();
    const letterId = replyCreateMatch[1];
    const found = state.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!found || found.status !== 'published') throw new ClientFallbackError(403, 'Replies are closed.');
    const parsed = replyInputSchema.safeParse(body);
    if (!parsed.success) throw new ClientFallbackError(400, parsed.error.issues[0]?.message || 'Invalid reply.');
    if (parsed.data.parentReplyId) {
      const parent = state.replies.find((r) => r.id === parsed.data.parentReplyId && !r.deletedAt);
      if (!parent || parent.parentReplyId) throw new ClientFallbackError(400, 'Only one nested response level is permitted.');
    }
    const now = new Date().toISOString();
    const created: StoredReply = {
      id: uuid(),
      letterId,
      authorId: p.id,
      parentReplyId: parsed.data.parentReplyId || null,
      body: parsed.data.body,
      status: 'published',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    state.replies.push(created);
    if (found.authorId !== p.id) {
      state.notifications.unshift({
        id: uuid(),
        recipientId: found.authorId,
        notificationType: 'reply_to_letter',
        title: 'Someone replied to your letter',
        body: `${p.displayName} responded to "${found.title || 'your letter'}".`,
        relatedLetterId: found.id,
        relatedReplyId: created.id,
        isRead: false,
        createdAt: now,
      });
    }
    saveState(state);
    return {
      reply: {
        id: created.id,
        letterId: created.letterId,
        parentReplyId: created.parentReplyId,
        authorDisplayName: p.displayName,
        isLetterAuthor: found.authorId === p.id,
        isOwner: true,
        body: created.body,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        children: [],
      },
      imminentHarmDetected: screenContentForSafety(created.body).imminentHarmDetected,
    } as T;
  }

  const replyEditMatch = pathname.match(/^\/api\/replies\/([^/]+)$/);
  if (replyEditMatch) {
    const p = requireAuth();
    const r = state.replies.find((x) => x.id === replyEditMatch[1] && !x.deletedAt);
    if (!r || r.authorId !== p.id) throw new ClientFallbackError(403, 'Not permitted.');
    if (method === 'PATCH') {
      r.body = String(body.body || '').trim();
      r.updatedAt = new Date().toISOString();
      saveState(state);
      return { reply: r } as T;
    }
    if (method === 'DELETE') {
      r.deletedAt = new Date().toISOString();
      saveState(state);
      return { deleted: true } as T;
    }
  }

  const reactMatch = pathname.match(/^\/api\/letters\/([^/]+)\/reaction$/);
  if (reactMatch && method === 'PUT') {
    const p = requireAuth();
    const letterId = reactMatch[1];
    const rt = (body.reactionType as ReactionType | null) || null;
    state.reactions = state.reactions.filter((r) => !(r.letterId === letterId && r.userId === p.id));
    if (rt) state.reactions.push({ letterId, userId: p.id, reactionType: rt });
    saveState(state);
    const letter = state.letters.find((l) => l.id === letterId);
    return { reactions: letter ? formatLetter(state, letter, p.id).reactions : emptyReactions(rt) } as T;
  }

  const saveMatch = pathname.match(/^\/api\/letters\/([^/]+)\/save$/);
  if (saveMatch && method === 'PUT') {
    const p = requireAuth();
    const letterId = saveMatch[1];
    const save = Boolean(body.save);
    state.saved = state.saved.filter((s) => !(s.letterId === letterId && s.userId === p.id));
    if (save) state.saved.push({ letterId, userId: p.id });
    saveState(state);
    return { isSaved: save } as T;
  }

  if (pathname === '/api/dashboard' && method === 'GET') {
    const p = requireAuth();
    const myLetters = state.letters.filter((l) => l.authorId === p.id && !l.deletedAt).map((l) => formatLetter(state, l, p.id));
    const myReplies = state.replies
      .filter((r) => r.authorId === p.id && !r.deletedAt)
      .map((r) => ({
        id: r.id,
        letterId: r.letterId,
        letterTitle: state.letters.find((l) => l.id === r.letterId)?.title ?? null,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt,
      }));
    const convIds = new Set([...myLetters.map((l) => l.id), ...myReplies.map((r) => r.letterId)]);
    const conversations = state.letters.filter((l) => convIds.has(l.id) && !l.deletedAt).map((l) => formatLetter(state, l, p.id));
    const savedIds = new Set(state.saved.filter((s) => s.userId === p.id).map((s) => s.letterId));
    const savedLetters = state.letters.filter((l) => savedIds.has(l.id) && !l.deletedAt).map((l) => formatLetter(state, l, p.id));
    const notifications = state.notifications.filter((n) => n.recipientId === p.id);
    const preferences = state.preferences[p.id] || {
      emailNotificationsEnabled: false,
      replyNotificationsEnabled: true,
      conversationNotificationsEnabled: true,
      marketingOptIn: false,
    };
    return {
      myLetters,
      myReplies,
      conversations,
      savedLetters,
      notifications,
      preferences,
      blockedAccounts: [],
      myAppeals: [],
    } as T;
  }

  if (pathname === '/api/notifications/read' && method === 'POST') {
    const p = requireAuth();
    state.notifications.forEach((n) => {
      if (n.recipientId === p.id && (!body.notificationId || n.id === body.notificationId)) {
        n.isRead = true;
      }
    });
    saveState(state);
    return { ok: true } as T;
  }

  if (pathname === '/api/preferences/notifications' && method === 'PUT') {
    const p = requireAuth();
    state.preferences[p.id] = {
      emailNotificationsEnabled: Boolean(body.emailNotificationsEnabled),
      replyNotificationsEnabled: body.replyNotificationsEnabled !== false,
      conversationNotificationsEnabled: body.conversationNotificationsEnabled !== false,
      marketingOptIn: false,
    };
    saveState(state);
    return { preferences: state.preferences[p.id] } as T;
  }

  if (pathname === '/api/reports' && method === 'POST') {
    requireAuth();
    const parsed = reportInputSchema.safeParse(body);
    if (!parsed.success) throw new ClientFallbackError(400, 'Invalid report.');
    state.reports.unshift({
      id: uuid(),
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      description: parsed.data.description ?? null,
      status: 'pending',
      appealNote: null,
      appealedAt: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    });
    saveState(state);
    return { submitted: true } as T;
  }

  if (pathname.endsWith('/share-event')) {
    return { recorded: true } as T;
  }

  throw new ClientFallbackError(404, 'Endpoint unavailable in static preview mode.');
}
