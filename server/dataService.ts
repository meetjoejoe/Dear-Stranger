import crypto from 'node:crypto';
import type {
  AccountStatus,
  AggregateMetricsDTO,
  BlockedAccountDTO,
  CategoryDTO,
  LetterStatus,
  ModerationActionDTO,
  NotificationDTO,
  NotificationPreferencesDTO,
  OpenLetterboxPromptLabel,
  ProfileDTO,
  PublicLetterDTO,
  ReactionSummary,
  ReactionType,
  ReplyDTO,
  ReportDTO,
  ReportReason,
} from '../src/shared/types.ts';
import { REACTION_TYPES } from '../src/shared/types.ts';
import {
  generateAnonymousNickname,
  letterInputSchema,
  nicknameSchema,
  replyInputSchema,
  reportInputSchema,
  sanitizePlainText,
  screenContentForSafety,
} from '../src/shared/validation.ts';
import {
  getServerConfig,
  getSupabaseAdminClient,
  isSupabaseConfigured,
} from './config.ts';
import { sendTransactionalNotificationEmail } from './emailService.ts';
import { sandboxStore, type SandboxLetter, type SandboxProfile } from './sandboxStore.ts';

export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface AuthContext {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
  profile: ProfileDTO;
}

function emptyReactionSummary(userReaction: ReactionType | null = null): ReactionSummary {
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

function computeOpenLetterboxLabel(categorySlug: string, body: string, title: string | null): OpenLetterboxPromptLabel {
  if (categorySlug === 'questions' || (title && title.includes('?')) || body.includes('?')) {
    return 'Someone has a question';
  }
  if (categorySlug === 'school-and-career' || categorySlug === 'personal-growth') {
    return 'Someone needs another perspective';
  }
  if (categorySlug === 'confessions' || categorySlug === 'random-thoughts') {
    return 'Someone wants to be heard';
  }
  return 'Someone needs encouragement';
}

// ---------------------------------------------------------------------------
// AUTH RESOLUTION & PROFILE PROVISIONING
// ---------------------------------------------------------------------------
export async function resolveAuthContext(bearerToken: string | null): Promise<AuthContext | null> {
  if (!bearerToken) return null;

  if (!isSupabaseConfigured()) {
    const prof = sandboxStore.getProfileByToken(bearerToken);
    if (!prof) return null;
    return {
      userId: prof.id,
      email: prof.recoveryEmail,
      isAnonymous: prof.isAnonymous,
      profile: toProfileDTO(prof),
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: userData, error: userErr } = await admin.auth.getUser(bearerToken);
  if (userErr || !userData.user) return null;

  const user = userData.user;
  const cfg = getServerConfig();
  const isAnonymous = Boolean((user as unknown as { is_anonymous?: boolean }).is_anonymous ?? !user.email);
  const recoveryEmailLinked = Boolean(user.email && user.email_confirmed_at);

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  let profileRow = existingProfile;

  if (!profileRow) {
    let nickname = generateAnonymousNickname();
    for (let i = 0; i < 5; i++) {
      const { data: conflict } = await admin
        .from('profiles')
        .select('id')
        .eq('display_name', nickname)
        .maybeSingle();
      if (!conflict) break;
      nickname = generateAnonymousNickname();
    }

    const { data: created, error: insertErr } = await admin
      .from('profiles')
      .insert({
        id: user.id,
        display_name: nickname,
        is_anonymous: isAnonymous,
        recovery_email_linked: recoveryEmailLinked,
      })
      .select('*')
      .single();

    if (insertErr) {
      throw new AppError(500, 'Could not initialize anonymous profile.');
    }
    profileRow = created;

    await admin.from('user_notification_preferences').upsert({
      user_id: user.id,
      email_notifications_enabled: false,
      reply_notifications_enabled: true,
      conversation_notifications_enabled: true,
      marketing_opt_in: false,
    });
  } else if (
    profileRow.is_anonymous !== isAnonymous ||
    profileRow.recovery_email_linked !== recoveryEmailLinked
  ) {
    const { data: updated } = await admin
      .from('profiles')
      .update({
        is_anonymous: isAnonymous,
        recovery_email_linked: recoveryEmailLinked,
      })
      .eq('id', user.id)
      .select('*')
      .single();
    if (updated) profileRow = updated;
  }

  if (profileRow.deleted_at || profileRow.account_status === 'deleted') {
    return null;
  }

  // Check admin_users table or configured bootstrap list
  let { data: adminRow } = await admin
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) {
    const emailMatch = user.email && cfg.adminBootstrapEmails.includes(user.email.toLowerCase());
    const idMatch = cfg.adminBootstrapUserIds.includes(user.id);
    if (emailMatch || idMatch) {
      const { data: bootstrapped } = await admin
        .from('admin_users')
        .upsert({ user_id: user.id, role: 'super_admin' })
        .select('role')
        .single();
      adminRow = bootstrapped;
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    isAnonymous,
    profile: {
      id: profileRow.id,
      displayName: profileRow.display_name,
      accountStatus: profileRow.account_status as AccountStatus,
      preferredTheme: profileRow.preferred_theme as 'light' | 'dark',
      preferredLanguage: profileRow.preferred_language,
      ageConfirmedAt: profileRow.age_confirmed_at,
      isAnonymous: profileRow.is_anonymous,
      recoveryEmailLinked: profileRow.recovery_email_linked,
      restrictionReason: profileRow.restriction_reason ?? null,
      isAdmin: Boolean(adminRow),
      adminRole: (adminRow?.role as ProfileDTO['adminRole']) ?? null,
      createdAt: profileRow.created_at,
    },
  };
}

function toProfileDTO(p: SandboxProfile): ProfileDTO {
  return {
    id: p.id,
    displayName: p.displayName,
    accountStatus: p.accountStatus,
    preferredTheme: p.preferredTheme,
    preferredLanguage: p.preferredLanguage,
    ageConfirmedAt: p.ageConfirmedAt,
    isAnonymous: p.isAnonymous,
    recoveryEmailLinked: p.recoveryEmailLinked,
    restrictionReason: p.restrictionReason,
    isAdmin: p.isAdmin,
    adminRole: p.adminRole,
    createdAt: p.createdAt,
  };
}

function requireActiveAccount(auth: AuthContext | null): AuthContext {
  if (!auth) throw new AppError(401, 'Please sign in anonymously or continue your session to perform this action.');
  if (auth.profile.accountStatus === 'suspended') {
    throw new AppError(403, 'Your account is currently suspended. You may submit an appeal from your dashboard.');
  }
  if (auth.profile.accountStatus === 'restricted') {
    throw new AppError(403, 'Your account is currently restricted from posting or replying.');
  }
  return auth;
}

function requireAgeConfirmed(auth: AuthContext): AuthContext {
  if (!auth.profile.ageConfirmedAt) {
    throw new AppError(403, 'Please confirm that you are 18 or older before participating.');
  }
  return auth;
}

function requireAdmin(auth: AuthContext | null): AuthContext {
  if (!auth || !auth.profile.isAdmin) {
    throw new AppError(403, 'Administrator access is required.');
  }
  return auth;
}

// ---------------------------------------------------------------------------
// SANDBOX AUTH HELPERS
// ---------------------------------------------------------------------------
export function createSandboxSession(asAdmin = false): { token: string; profile: ProfileDTO } {
  const { token, profile } = sandboxStore.createSession({ asAdmin });
  return { token, profile: toProfileDTO(profile) };
}

export function setSandboxAdminMode(auth: AuthContext, enabled: boolean): ProfileDTO {
  if (isSupabaseConfigured()) {
    throw new AppError(403, 'Sandbox admin toggle is disabled when connected to Supabase.');
  }
  const prof = sandboxStore.profiles.get(auth.userId);
  if (!prof) throw new AppError(404, 'Profile not found.');
  prof.isAdmin = enabled;
  prof.adminRole = enabled ? 'admin' : null;
  return toProfileDTO(prof);
}

// ---------------------------------------------------------------------------
// PLATFORM CONFIG & ANNOUNCEMENTS
// ---------------------------------------------------------------------------
export async function getPlatformAnnouncement(): Promise<{ active: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return sandboxStore.platformAnnouncement;
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return { active: false, message: '' };
  const { data } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'platform_announcement')
    .maybeSingle();
  const val = (data?.value as { active?: boolean; message?: string } | undefined) || {};
  return {
    active: Boolean(val.active && val.message),
    message: val.message || '',
  };
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------
export async function listCategories(includeInactive = false): Promise<CategoryDTO[]> {
  if (!isSupabaseConfigured()) {
    return sandboxStore.categories
      .filter((c) => includeInactive || c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  const admin = getSupabaseAdminClient()!;
  let query = admin.from('categories').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;
  if (error) throw new AppError(500, 'Failed to load categories.');
  return (data || []) as CategoryDTO[];
}

export async function createOrUpdateCategory(
  auth: AuthContext | null,
  input: { id?: string; name: string; slug: string; description: string; is_active: boolean; sort_order: number }
): Promise<CategoryDTO> {
  const mod = requireAdmin(auth);
  const name = sanitizePlainText(input.name);
  const slug = sanitizePlainText(input.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const description = sanitizePlainText(input.description);
  if (!name || !slug) throw new AppError(400, 'Category name and slug are required.');

  if (!isSupabaseConfigured()) {
    if (input.id) {
      const existing = sandboxStore.categories.find((c) => c.id === input.id);
      if (!existing) throw new AppError(404, 'Category not found.');
      existing.name = name;
      existing.slug = slug;
      existing.description = description;
      existing.is_active = input.is_active;
      existing.sort_order = input.sort_order;
      return existing;
    }
    const created: CategoryDTO = {
      id: crypto.randomUUID(),
      name,
      slug,
      description,
      is_active: input.is_active,
      sort_order: input.sort_order,
    };
    sandboxStore.categories.push(created);
    return created;
  }

  const admin = getSupabaseAdminClient()!;
  if (input.id) {
    const { data, error } = await admin
      .from('categories')
      .update({ name, slug, description, is_active: input.is_active, sort_order: input.sort_order })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new AppError(400, error.message);
    await recordModerationAction(mod.userId, 'report', input.id, 'update_category', `Updated category ${name}`);
    return data as CategoryDTO;
  }

  const { data, error } = await admin
    .from('categories')
    .insert({ name, slug, description, is_active: input.is_active, sort_order: input.sort_order })
    .select('*')
    .single();
  if (error) throw new AppError(400, error.message);
  await recordModerationAction(mod.userId, 'report', data.id, 'create_category', `Created category ${name}`);
  return data as CategoryDTO;
}

// ---------------------------------------------------------------------------
// LETTERS: ENRICHMENT HELPER
// ---------------------------------------------------------------------------
async function getBlockedUserIds(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  if (!isSupabaseConfigured()) {
    const set = new Set<string>();
    for (const b of sandboxStore.blocks) {
      if (b.blockerId === viewerId) set.add(b.blockedId);
      if (b.blockedId === viewerId) set.add(b.blockerId);
    }
    return set;
  }
  const admin = getSupabaseAdminClient()!;
  const { data } = await admin
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);
  const set = new Set<string>();
  for (const row of data || []) {
    if (row.blocker_id === viewerId) set.add(row.blocked_id);
    if (row.blocked_id === viewerId) set.add(row.blocker_id);
  }
  return set;
}

function formatSandboxLetterDTO(
  letter: SandboxLetter,
  viewerId: string | null
): PublicLetterDTO {
  const cat = sandboxStore.categories.find((c) => c.id === letter.categoryId) || {
    id: letter.categoryId,
    name: 'Life',
    slug: 'life',
  };
  const author = sandboxStore.profiles.get(letter.authorId);
  const replies = sandboxStore.replies.filter(
    (r) => r.letterId === letter.id && !r.deletedAt && r.status === 'published'
  );
  const letterReactions = sandboxStore.reactions.filter((r) => r.letterId === letter.id);
  const summary = emptyReactionSummary();
  for (const r of letterReactions) {
    summary.counts[r.reactionType] += 1;
    summary.total += 1;
    if (viewerId && r.userId === viewerId) {
      summary.userReaction = r.reactionType;
    }
  }
  const isSaved = Boolean(
    viewerId && sandboxStore.savedLetters.some((s) => s.letterId === letter.id && s.userId === viewerId)
  );

  return {
    id: letter.id,
    title: letter.title,
    body: letter.body,
    category: { id: cat.id, name: cat.name, slug: cat.slug },
    authorDisplayName: author?.displayName || 'AnonymousStranger',
    visibility: letter.visibility === 'unlisted' ? 'unlisted' : 'public',
    status: letter.status,
    allowExternalSharing: letter.allowExternalSharing,
    language: letter.language,
    publishedAt: letter.publishedAt,
    createdAt: letter.createdAt,
    updatedAt: letter.updatedAt,
    replyCount: replies.length,
    reactions: summary,
    isOwner: Boolean(viewerId && letter.authorId === viewerId),
    isSaved,
    isSandboxSample: letter.isSandboxSample,
  };
}

async function enrichSupabaseLetters(
  rows: Array<Record<string, unknown>>,
  viewerId: string | null
): Promise<PublicLetterDTO[]> {
  if (rows.length === 0) return [];
  const admin = getSupabaseAdminClient()!;
  const letterIds = rows.map((r) => String(r.id));
  const authorIds = Array.from(new Set(rows.map((r) => String(r.author_id))));
  const categoryIds = Array.from(new Set(rows.map((r) => String(r.category_id))));

  const [profilesRes, categoriesRes, repliesRes, reactionsRes, savedRes] = await Promise.all([
    admin.from('profiles').select('id, display_name').in('id', authorIds),
    admin.from('categories').select('id, name, slug').in('id', categoryIds),
    admin
      .from('replies')
      .select('id, letter_id')
      .in('letter_id', letterIds)
      .is('deleted_at', null)
      .eq('status', 'published'),
    admin.from('reactions').select('letter_id, user_id, reaction_type').in('letter_id', letterIds),
    viewerId
      ? admin
          .from('saved_letters')
          .select('letter_id')
          .eq('user_id', viewerId)
          .in('letter_id', letterIds)
      : Promise.resolve({ data: [] as Array<{ letter_id: string }> }),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p.display_name]));
  const categoryMap = new Map((categoriesRes.data || []).map((c) => [c.id, c]));
  const replyCountMap = new Map<string, number>();
  for (const r of repliesRes.data || []) {
    replyCountMap.set(r.letter_id, (replyCountMap.get(r.letter_id) || 0) + 1);
  }
  const reactionMap = new Map<string, ReactionSummary>();
  for (const id of letterIds) reactionMap.set(id, emptyReactionSummary());
  for (const r of reactionsRes.data || []) {
    const summary = reactionMap.get(r.letter_id);
    if (!summary) continue;
    const rt = r.reaction_type as ReactionType;
    if (REACTION_TYPES.includes(rt)) {
      summary.counts[rt] += 1;
      summary.total += 1;
      if (viewerId && r.user_id === viewerId) summary.userReaction = rt;
    }
  }
  const savedSet = new Set((savedRes.data || []).map((s) => s.letter_id));

  return rows.map((row) => {
    const id = String(row.id);
    const cat = categoryMap.get(String(row.category_id)) || {
      id: String(row.category_id),
      name: 'Life',
      slug: 'life',
    };
    return {
      id,
      title: (row.title as string | null) ?? null,
      body: String(row.body),
      category: { id: cat.id, name: cat.name, slug: cat.slug },
      authorDisplayName: profileMap.get(String(row.author_id)) || 'AnonymousStranger',
      visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
      status: row.status as LetterStatus,
      allowExternalSharing: Boolean(row.allow_external_sharing),
      language: String(row.language || 'en'),
      publishedAt: (row.published_at as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      replyCount: replyCountMap.get(id) || 0,
      reactions: reactionMap.get(id) || emptyReactionSummary(),
      isOwner: Boolean(viewerId && String(row.author_id) === viewerId),
      isSaved: savedSet.has(id),
    };
  });
}

// ---------------------------------------------------------------------------
// EXPLORE PUBLIC LETTERS & SEARCH
// ---------------------------------------------------------------------------
export async function listPublicLetters(params: {
  viewerId: string | null;
  categorySlug?: string;
  query?: string;
  page?: number;
  limit?: number;
}): Promise<{ letters: PublicLetterDTO[]; total: number; page: number; hasMore: boolean }> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(30, Math.max(1, params.limit || 12));
  const offset = (page - 1) * limit;
  const searchQuery = params.query ? sanitizePlainText(params.query) : '';
  const blockedIds = await getBlockedUserIds(params.viewerId);

  if (!isSupabaseConfigured()) {
    let items = sandboxStore.letters.filter(
      (l) =>
        l.visibility === 'public' &&
        (l.status === 'published' || l.status === 'locked') &&
        !l.deletedAt &&
        !blockedIds.has(l.authorId)
    );

    if (params.categorySlug && params.categorySlug !== 'all') {
      const cat = sandboxStore.categories.find((c) => c.slug === params.categorySlug);
      if (cat) {
        items = items.filter((l) => l.categoryId === cat.id);
      } else {
        items = [];
      }
    }

    if (searchQuery) {
      const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter((l) => {
        const hay = `${l.title || ''} ${l.body}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }

    items.sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
    const total = items.length;
    const paged = items.slice(offset, offset + limit).map((l) => formatSandboxLetterDTO(l, params.viewerId));
    return { letters: paged, total, page, hasMore: offset + limit < total };
  }

  const admin = getSupabaseAdminClient()!;
  let categoryIdFilter: string | null = null;
  if (params.categorySlug && params.categorySlug !== 'all') {
    const { data: cat } = await admin
      .from('categories')
      .select('id')
      .eq('slug', params.categorySlug)
      .maybeSingle();
    if (!cat) {
      return { letters: [], total: 0, page, hasMore: false };
    }
    categoryIdFilter = cat.id;
  }

  let dbQuery = admin
    .from('letters')
    .select('*', { count: 'exact' })
    .eq('visibility', 'public')
    .in('status', ['published', 'locked'])
    .is('deleted_at', null);

  if (categoryIdFilter) {
    dbQuery = dbQuery.eq('category_id', categoryIdFilter);
  }

  if (blockedIds.size > 0) {
    dbQuery = dbQuery.not('author_id', 'in', `(${Array.from(blockedIds).join(',')})`);
  }

  if (searchQuery) {
    dbQuery = dbQuery.textSearch('search_vector', searchQuery, {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, count, error } = await dbQuery
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError(500, 'Could not search letters.');
  }

  const letters = await enrichSupabaseLetters((data || []) as Array<Record<string, unknown>>, params.viewerId);
  const total = count || 0;
  return { letters, total, page, hasMore: offset + limit < total };
}

// ---------------------------------------------------------------------------
// SURPRISE ME (Random eligible public letter, avoiding repeats)
// ---------------------------------------------------------------------------
export async function getSurpriseLetter(
  viewerId: string | null,
  excludeIds: string[] = []
): Promise<PublicLetterDTO | null> {
  const blockedIds = await getBlockedUserIds(viewerId);
  const excludeSet = new Set(excludeIds.slice(-30));

  if (!isSupabaseConfigured()) {
    const eligible = sandboxStore.letters.filter(
      (l) =>
        l.visibility === 'public' &&
        (l.status === 'published' || l.status === 'locked') &&
        !l.deletedAt &&
        !blockedIds.has(l.authorId)
    );
    if (eligible.length === 0) return null;
    const unvisited = eligible.filter((l) => !excludeSet.has(l.id));
    const pool = unvisited.length > 0 ? unvisited : eligible;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return formatSandboxLetterDTO(picked, viewerId);
  }

  const admin = getSupabaseAdminClient()!;
  let query = admin
    .from('letters')
    .select('id')
    .eq('visibility', 'public')
    .in('status', ['published', 'locked'])
    .is('deleted_at', null)
    .limit(200);

  if (blockedIds.size > 0) {
    query = query.not('author_id', 'in', `(${Array.from(blockedIds).join(',')})`);
  }

  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) return null;
  const unvisited = candidates.filter((c) => !excludeSet.has(c.id));
  const pool = unvisited.length > 0 ? unvisited : candidates;
  const chosenId = pool[Math.floor(Math.random() * pool.length)].id;

  const { data: letterRow } = await admin.from('letters').select('*').eq('id', chosenId).single();
  if (!letterRow) return null;
  const enriched = await enrichSupabaseLetters([letterRow as Record<string, unknown>], viewerId);
  return enriched[0] || null;
}

// ---------------------------------------------------------------------------
// OPEN LETTERBOX (Eligible public letters needing thoughtful responses)
// ---------------------------------------------------------------------------
export async function getOpenLetterbox(viewerId: string | null): Promise<PublicLetterDTO[]> {
  const { letters } = await listPublicLetters({ viewerId, page: 1, limit: 30 });
  const needingResponses = letters.filter((l) => l.status === 'published' && l.replyCount <= 2);
  needingResponses.sort((a, b) => a.replyCount - b.replyCount);
  return needingResponses.slice(0, 12).map((l) => ({
    ...l,
    openLetterboxLabel: computeOpenLetterboxLabel(l.category.slug, l.body, l.title),
  }));
}

// ---------------------------------------------------------------------------
// LETTER OF THE DAY
// ---------------------------------------------------------------------------
export async function getLetterOfTheDay(viewerId: string | null): Promise<{
  letter: PublicLetterDTO | null;
  editorNote: string | null;
}> {
  if (!isSupabaseConfigured()) {
    if (!sandboxStore.letterOfTheDayId) return { letter: null, editorNote: null };
    const found = sandboxStore.letters.find(
      (l) =>
        l.id === sandboxStore.letterOfTheDayId &&
        l.visibility === 'public' &&
        (l.status === 'published' || l.status === 'locked') &&
        !l.deletedAt
    );
    return {
      letter: found ? formatSandboxLetterDTO(found, viewerId) : null,
      editorNote: null,
    };
  }

  const admin = getSupabaseAdminClient()!;
  const { data: setting } = await admin
    .from('platform_settings')
    .select('value')
    .eq('key', 'letter_of_the_day')
    .maybeSingle();

  const val = (setting?.value as { letter_id?: string | null; editor_note?: string | null } | undefined) || {};
  if (!val.letter_id) return { letter: null, editorNote: null };

  const { data: letterRow } = await admin
    .from('letters')
    .select('*')
    .eq('id', val.letter_id)
    .eq('visibility', 'public')
    .in('status', ['published', 'locked'])
    .is('deleted_at', null)
    .maybeSingle();

  if (!letterRow) return { letter: null, editorNote: null };
  const enriched = await enrichSupabaseLetters([letterRow as Record<string, unknown>], viewerId);
  return { letter: enriched[0] || null, editorNote: val.editor_note || null };
}

// ---------------------------------------------------------------------------
// LETTER DETAIL (Public or Direct-Link Unlisted; never leaks private/removed)
// ---------------------------------------------------------------------------
export async function getLetterDetail(
  letterId: string,
  auth: AuthContext | null,
  recordOpenEvent = true
): Promise<{ letter: PublicLetterDTO; replies: ReplyDTO[] }> {
  const viewerId = auth?.userId || null;
  const blockedIds = await getBlockedUserIds(viewerId);

  if (!isSupabaseConfigured()) {
    const letter = sandboxStore.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!letter) throw new AppError(404, 'Letter not found.');

    const isOwner = viewerId === letter.authorId;
    const isAdmin = Boolean(auth?.profile.isAdmin);

    if (letter.visibility === 'private_reserved' && !isOwner) {
      throw new AppError(404, 'Letter not found.');
    }
    if ((letter.status === 'removed' || letter.status === 'draft' || letter.status === 'flagged_for_review') && !isOwner && !isAdmin) {
      throw new AppError(404, 'This letter is not available.');
    }
    if (blockedIds.has(letter.authorId) && !isOwner && !isAdmin) {
      throw new AppError(404, 'Letter not found.');
    }

    if (recordOpenEvent && letter.status === 'published') {
      sandboxStore.metrics.letterOpened += 1;
    }

    const dto = formatSandboxLetterDTO(letter, viewerId);
    const rawReplies = sandboxStore.replies
      .filter((r) => r.letterId === letter.id && !r.deletedAt && (r.status === 'published' || r.authorId === viewerId || isAdmin))
      .filter((r) => !blockedIds.has(r.authorId) || r.authorId === viewerId || isAdmin)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const mapReply = (r: (typeof rawReplies)[number]): ReplyDTO => ({
      id: r.id,
      letterId: r.letterId,
      parentReplyId: r.parentReplyId,
      authorDisplayName: sandboxStore.profiles.get(r.authorId)?.displayName || 'AnonymousStranger',
      isLetterAuthor: r.authorId === letter.authorId,
      isOwner: Boolean(viewerId && r.authorId === viewerId),
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      children: [],
    });

    const topLevel: ReplyDTO[] = [];
    const byId = new Map<string, ReplyDTO>();
    for (const r of rawReplies) {
      const node = mapReply(r);
      byId.set(node.id, node);
      if (!r.parentReplyId) {
        topLevel.push(node);
      }
    }
    for (const r of rawReplies) {
      if (r.parentReplyId) {
        const parent = byId.get(r.parentReplyId);
        const child = byId.get(r.id);
        if (parent && child) parent.children.push(child);
      }
    }

    return { letter: dto, replies: topLevel };
  }

  const admin = getSupabaseAdminClient()!;
  const { data: row } = await admin
    .from('letters')
    .select('*')
    .eq('id', letterId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!row) throw new AppError(404, 'Letter not found.');
  const isOwner = Boolean(viewerId && row.author_id === viewerId);
  const isAdmin = Boolean(auth?.profile.isAdmin);

  if (row.visibility === 'private_reserved' && !isOwner) {
    throw new AppError(404, 'Letter not found.');
  }
  if ((row.status === 'removed' || row.status === 'draft' || row.status === 'flagged_for_review') && !isOwner && !isAdmin) {
    throw new AppError(404, 'This letter is not available.');
  }
  if (blockedIds.has(row.author_id) && !isOwner && !isAdmin) {
    throw new AppError(404, 'Letter not found.');
  }

  const [enriched] = await enrichSupabaseLetters([row as Record<string, unknown>], viewerId);

  if (recordOpenEvent && row.status === 'published') {
    await admin.from('analytics_events').insert({
      event_type: 'letter_opened',
      category_slug: enriched.category.slug,
      letter_id: row.id,
    });
  }

  const { data: replyRows } = await admin
    .from('replies')
    .select('*')
    .eq('letter_id', letterId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const visibleReplies = (replyRows || []).filter(
    (r) =>
      (r.status === 'published' || r.author_id === viewerId || isAdmin) &&
      (!blockedIds.has(r.author_id) || r.author_id === viewerId || isAdmin)
  );

  const replyAuthorIds = Array.from(new Set(visibleReplies.map((r) => r.author_id)));
  const { data: replyProfiles } =
    replyAuthorIds.length > 0
      ? await admin.from('profiles').select('id, display_name').in('id', replyAuthorIds)
      : { data: [] as Array<{ id: string; display_name: string }> };
  const replyNameMap = new Map((replyProfiles || []).map((p) => [p.id, p.display_name]));

  const topLevel: ReplyDTO[] = [];
  const byId = new Map<string, ReplyDTO>();
  for (const r of visibleReplies) {
    const node: ReplyDTO = {
      id: r.id,
      letterId: r.letter_id,
      parentReplyId: r.parent_reply_id,
      authorDisplayName: replyNameMap.get(r.author_id) || 'AnonymousStranger',
      isLetterAuthor: r.author_id === row.author_id,
      isOwner: Boolean(viewerId && r.author_id === viewerId),
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      children: [],
    };
    byId.set(node.id, node);
    if (!r.parent_reply_id) topLevel.push(node);
  }
  for (const r of visibleReplies) {
    if (r.parent_reply_id) {
      const parent = byId.get(r.parent_reply_id);
      const child = byId.get(r.id);
      if (parent && child) parent.children.push(child);
    }
  }

  return { letter: enriched, replies: topLevel };
}

// ---------------------------------------------------------------------------
// CREATE / UPDATE / DELETE LETTERS
// ---------------------------------------------------------------------------
export async function createLetter(
  auth: AuthContext | null,
  rawInput: unknown
): Promise<{ letter: PublicLetterDTO; safetyNotice: { imminentHarmDetected: boolean; flaggedForReview: boolean } }> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));
  const parsed = letterInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid letter input.');
  }

  const data = parsed.data;
  const safety = screenContentForSafety(`${data.title || ''}\n${data.body}`);
  const finalStatus: LetterStatus =
    data.status === 'draft'
      ? 'draft'
      : safety.requiresModeratorReview
        ? 'flagged_for_review'
        : 'published';
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const cat = sandboxStore.categories.find((c) => c.id === data.categoryId && c.is_active);
    if (!cat) throw new AppError(400, 'Selected category is not available.');

    const letter: SandboxLetter = {
      id: crypto.randomUUID(),
      authorId: activeAuth.userId,
      title: data.title,
      body: data.body,
      categoryId: data.categoryId,
      visibility: data.visibility,
      status: finalStatus,
      allowExternalSharing: data.allowExternalSharing,
      isFlaggedSafety: safety.requiresModeratorReview || safety.imminentHarmDetected,
      safetyFlagReason: safety.flagReason,
      language: activeAuth.profile.preferredLanguage || 'en',
      createdAt: now,
      updatedAt: now,
      publishedAt: finalStatus === 'published' ? now : null,
      deletedAt: null,
      isSandboxSample: false,
    };
    sandboxStore.letters.unshift(letter);

    if (finalStatus === 'published') {
      sandboxStore.metrics.letterSubmitted += 1;
      const priorLetters = sandboxStore.letters.filter((l) => l.authorId === activeAuth.userId).length;
      if (priorLetters > 1) sandboxStore.metrics.returnParticipation += 1;
    }

    return {
      letter: formatSandboxLetterDTO(letter, activeAuth.userId),
      safetyNotice: {
        imminentHarmDetected: safety.imminentHarmDetected,
        flaggedForReview: safety.requiresModeratorReview,
      },
    };
  }

  const admin = getSupabaseAdminClient()!;
  const { data: cat } = await admin
    .from('categories')
    .select('id, slug')
    .eq('id', data.categoryId)
    .eq('is_active', true)
    .maybeSingle();
  if (!cat) throw new AppError(400, 'Selected category is not available.');

  const { data: inserted, error } = await admin
    .from('letters')
    .insert({
      author_id: activeAuth.userId,
      title: data.title,
      body: data.body,
      category_id: data.categoryId,
      visibility: data.visibility,
      status: finalStatus,
      allow_external_sharing: data.allowExternalSharing,
      is_flagged_safety: safety.requiresModeratorReview || safety.imminentHarmDetected,
      safety_flag_reason: safety.flagReason,
      language: activeAuth.profile.preferredLanguage || 'en',
      published_at: finalStatus === 'published' ? now : null,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    throw new AppError(500, 'Could not save letter.');
  }

  if (finalStatus === 'published') {
    await admin.from('analytics_events').insert({
      event_type: 'letter_submitted',
      category_slug: cat.slug,
      letter_id: inserted.id,
    });
  }

  const [enriched] = await enrichSupabaseLetters([inserted as Record<string, unknown>], activeAuth.userId);
  return {
    letter: enriched,
    safetyNotice: {
      imminentHarmDetected: safety.imminentHarmDetected,
      flaggedForReview: safety.requiresModeratorReview,
    },
  };
}

export async function updateOwnLetter(
  auth: AuthContext | null,
  letterId: string,
  rawInput: unknown
): Promise<PublicLetterDTO> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));
  const parsed = letterInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid letter input.');
  }
  const data = parsed.data;
  const safety = screenContentForSafety(`${data.title || ''}\n${data.body}`);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const letter = sandboxStore.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!letter) throw new AppError(404, 'Letter not found.');
    if (letter.authorId !== activeAuth.userId) throw new AppError(403, 'You can only edit your own letters.');
    if (letter.status === 'removed' || letter.status === 'locked') {
      throw new AppError(403, 'Removed or locked letters cannot be edited.');
    }

    letter.title = data.title;
    letter.body = data.body;
    letter.categoryId = data.categoryId;
    letter.visibility = data.visibility;
    letter.allowExternalSharing = data.allowExternalSharing;
    letter.status = data.status === 'draft' ? 'draft' : safety.requiresModeratorReview ? 'flagged_for_review' : 'published';
    if (letter.status === 'published' && !letter.publishedAt) letter.publishedAt = now;
    letter.updatedAt = now;
    return formatSandboxLetterDTO(letter, activeAuth.userId);
  }

  const admin = getSupabaseAdminClient()!;
  const { data: existing } = await admin
    .from('letters')
    .select('*')
    .eq('id', letterId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) throw new AppError(404, 'Letter not found.');
  if (existing.author_id !== activeAuth.userId) throw new AppError(403, 'You can only edit your own letters.');
  if (existing.status === 'removed' || existing.status === 'locked') {
    throw new AppError(403, 'Removed or locked letters cannot be edited.');
  }

  const nextStatus =
    data.status === 'draft' ? 'draft' : safety.requiresModeratorReview ? 'flagged_for_review' : 'published';

  const { data: updated, error } = await admin
    .from('letters')
    .update({
      title: data.title,
      body: data.body,
      category_id: data.categoryId,
      visibility: data.visibility,
      allow_external_sharing: data.allowExternalSharing,
      status: nextStatus,
      is_flagged_safety: safety.requiresModeratorReview || safety.imminentHarmDetected,
      safety_flag_reason: safety.flagReason,
      published_at: existing.published_at || (nextStatus === 'published' ? now : null),
    })
    .eq('id', letterId)
    .select('*')
    .single();

  if (error || !updated) throw new AppError(500, 'Could not update letter.');
  const [enriched] = await enrichSupabaseLetters([updated as Record<string, unknown>], activeAuth.userId);
  return enriched;
}

export async function deleteOwnLetter(auth: AuthContext | null, letterId: string): Promise<void> {
  const activeAuth = requireActiveAccount(auth);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const letter = sandboxStore.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!letter) throw new AppError(404, 'Letter not found.');
    if (letter.authorId !== activeAuth.userId) throw new AppError(403, 'You can only delete your own letters.');
    letter.deletedAt = now;
    return;
  }

  const admin = getSupabaseAdminClient()!;
  const { data: existing } = await admin
    .from('letters')
    .select('id, author_id')
    .eq('id', letterId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) throw new AppError(404, 'Letter not found.');
  if (existing.author_id !== activeAuth.userId) throw new AppError(403, 'You can only delete your own letters.');

  const { error } = await admin.from('letters').update({ deleted_at: now }).eq('id', letterId);
  if (error) throw new AppError(500, 'Could not delete letter.');
}

// ---------------------------------------------------------------------------
// REPLIES (Strictly 1-level nesting + Notifications + Resend Email)
// ---------------------------------------------------------------------------
export async function createReply(
  auth: AuthContext | null,
  letterId: string,
  rawInput: unknown
): Promise<{ reply: ReplyDTO; imminentHarmDetected: boolean }> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));
  const parsed = replyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid reply.');
  }
  const { body, parentReplyId } = parsed.data;
  const safety = screenContentForSafety(body);
  const now = new Date().toISOString();
  const status: 'published' | 'flagged_for_review' = safety.requiresModeratorReview ? 'flagged_for_review' : 'published';

  if (!isSupabaseConfigured()) {
    const letter = sandboxStore.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!letter) throw new AppError(404, 'Letter not found.');
    if (letter.status !== 'published') {
      throw new AppError(403, 'Replies are closed on this letter.');
    }

    let parentAuthorId: string | null = null;
    if (parentReplyId) {
      const parent = sandboxStore.replies.find((r) => r.id === parentReplyId && !r.deletedAt);
      if (!parent || parent.letterId !== letter.id) {
        throw new AppError(400, 'Parent reply not found on this letter.');
      }
      if (parent.parentReplyId !== null) {
        throw new AppError(400, 'Only one nested response level is permitted.');
      }
      parentAuthorId = parent.authorId;
    }

    const priorCount = sandboxStore.replies.filter((r) => r.letterId === letter.id && !r.deletedAt).length;
    const reply = {
      id: crypto.randomUUID(),
      letterId: letter.id,
      authorId: activeAuth.userId,
      parentReplyId: parentReplyId || null,
      body,
      status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    sandboxStore.replies.push(reply);
    sandboxStore.metrics.replySubmitted += 1;
    if (priorCount === 0) sandboxStore.metrics.firstReplyReceived += 1;

    // Notifications
    if (letter.authorId !== activeAuth.userId) {
      sandboxStore.notifications.unshift({
        id: crypto.randomUUID(),
        recipientId: letter.authorId,
        actorId: activeAuth.userId,
        notificationType: 'reply_to_letter',
        title: 'Someone replied to your letter',
        body: `${activeAuth.profile.displayName} left a response on "${letter.title || 'your letter'}".`,
        relatedLetterId: letter.id,
        relatedReplyId: reply.id,
        isRead: false,
        createdAt: now,
      });
    }
    if (parentAuthorId && parentAuthorId !== activeAuth.userId && parentAuthorId !== letter.authorId) {
      sandboxStore.notifications.unshift({
        id: crypto.randomUUID(),
        recipientId: parentAuthorId,
        actorId: activeAuth.userId,
        notificationType: 'response_to_reply',
        title: 'New response to your reply',
        body: `${activeAuth.profile.displayName} responded to your reply.`,
        relatedLetterId: letter.id,
        relatedReplyId: reply.id,
        isRead: false,
        createdAt: now,
      });
    }

    return {
      reply: {
        id: reply.id,
        letterId: reply.letterId,
        parentReplyId: reply.parentReplyId,
        authorDisplayName: activeAuth.profile.displayName,
        isLetterAuthor: letter.authorId === activeAuth.userId,
        isOwner: true,
        body: reply.body,
        status: reply.status,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        children: [],
      },
      imminentHarmDetected: safety.imminentHarmDetected,
    };
  }

  const admin = getSupabaseAdminClient()!;
  const { data: letter } = await admin
    .from('letters')
    .select('id, author_id, title, status')
    .eq('id', letterId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!letter) throw new AppError(404, 'Letter not found.');
  if (letter.status !== 'published') throw new AppError(403, 'Replies are closed on this letter.');

  let parentAuthorId: string | null = null;
  if (parentReplyId) {
    const { data: parent } = await admin
      .from('replies')
      .select('id, letter_id, author_id, parent_reply_id')
      .eq('id', parentReplyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!parent || parent.letter_id !== letter.id) {
      throw new AppError(400, 'Parent reply not found on this letter.');
    }
    if (parent.parent_reply_id !== null) {
      throw new AppError(400, 'Only one nested response level is permitted.');
    }
    parentAuthorId = parent.author_id;
  }

  const { count: priorReplyCount } = await admin
    .from('replies')
    .select('id', { count: 'exact', head: true })
    .eq('letter_id', letter.id)
    .is('deleted_at', null);

  const { data: inserted, error } = await admin
    .from('replies')
    .insert({
      letter_id: letter.id,
      author_id: activeAuth.userId,
      parent_reply_id: parentReplyId || null,
      body,
      status,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    throw new AppError(400, error?.message || 'Could not post reply.');
  }

  await admin.from('analytics_events').insert({ event_type: 'reply_submitted', letter_id: letter.id });
  if ((priorReplyCount || 0) === 0) {
    await admin.from('analytics_events').insert({ event_type: 'first_reply_received', letter_id: letter.id });
  }

  // Create notifications + optional email
  const notifyUser = async (
    recipientId: string,
    type: 'reply_to_letter' | 'response_to_reply',
    title: string,
    msg: string
  ) => {
    const { data: prefs } = await admin
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', recipientId)
      .maybeSingle();

    const shouldInApp =
      type === 'reply_to_letter'
        ? prefs?.reply_notifications_enabled ?? true
        : prefs?.conversation_notifications_enabled ?? true;

    if (shouldInApp) {
      await admin.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: activeAuth.userId,
        notification_type: type,
        title,
        body: msg,
        related_letter_id: letter.id,
        related_reply_id: inserted.id,
      });
    }

    if (prefs?.email_notifications_enabled) {
      const { data: userLookup } = await admin.auth.admin.getUserById(recipientId);
      const email = userLookup.user?.email;
      const cfg = getServerConfig();
      if (email && cfg.appUrl) {
        await sendTransactionalNotificationEmail({
          recipientUserId: recipientId,
          recipientEmail: email,
          eventType: type,
          subject: `Dear Stranger — ${title}`,
          headline: title,
          messageBody: msg,
          actionUrl: `${cfg.appUrl.replace(/\/$/, '')}/letters/${letter.id}`,
          actionLabel: 'Read Response',
        });
      }
    }
  };

  if (letter.author_id !== activeAuth.userId) {
    await notifyUser(
      letter.author_id,
      'reply_to_letter',
      'Someone replied to your letter',
      `${activeAuth.profile.displayName} responded to "${letter.title || 'your letter'}".`
    );
  }
  if (parentAuthorId && parentAuthorId !== activeAuth.userId && parentAuthorId !== letter.author_id) {
    await notifyUser(
      parentAuthorId,
      'response_to_reply',
      'New response to your reply',
      `${activeAuth.profile.displayName} responded to your thought.`
    );
  }

  return {
    reply: {
      id: inserted.id,
      letterId: inserted.letter_id,
      parentReplyId: inserted.parent_reply_id,
      authorDisplayName: activeAuth.profile.displayName,
      isLetterAuthor: letter.author_id === activeAuth.userId,
      isOwner: true,
      body: inserted.body,
      status: inserted.status,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
      children: [],
    },
    imminentHarmDetected: safety.imminentHarmDetected,
  };
}

export async function updateOwnReply(auth: AuthContext | null, replyId: string, bodyRaw: string): Promise<ReplyDTO> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));
  const parsed = replyInputSchema.pick({ body: true }).safeParse({ body: bodyRaw });
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid reply.');

  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const r = sandboxStore.replies.find((x) => x.id === replyId && !x.deletedAt);
    if (!r) throw new AppError(404, 'Reply not found.');
    if (r.authorId !== activeAuth.userId) throw new AppError(403, 'You can only edit your own replies.');
    r.body = parsed.data.body;
    r.updatedAt = now;
    const letter = sandboxStore.letters.find((l) => l.id === r.letterId);
    return {
      id: r.id,
      letterId: r.letterId,
      parentReplyId: r.parentReplyId,
      authorDisplayName: activeAuth.profile.displayName,
      isLetterAuthor: Boolean(letter && letter.authorId === activeAuth.userId),
      isOwner: true,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      children: [],
    };
  }

  const admin = getSupabaseAdminClient()!;
  const { data: existing } = await admin
    .from('replies')
    .select('*, letters(author_id)')
    .eq('id', replyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) throw new AppError(404, 'Reply not found.');
  if (existing.author_id !== activeAuth.userId) throw new AppError(403, 'You can only edit your own replies.');

  const { data: updated, error } = await admin
    .from('replies')
    .update({ body: parsed.data.body })
    .eq('id', replyId)
    .select('*')
    .single();
  if (error || !updated) throw new AppError(500, 'Could not update reply.');

  const letterAuthorId = (existing.letters as { author_id?: string } | null)?.author_id;
  return {
    id: updated.id,
    letterId: updated.letter_id,
    parentReplyId: updated.parent_reply_id,
    authorDisplayName: activeAuth.profile.displayName,
    isLetterAuthor: letterAuthorId === activeAuth.userId,
    isOwner: true,
    body: updated.body,
    status: updated.status,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    children: [],
  };
}

export async function deleteOwnReply(auth: AuthContext | null, replyId: string): Promise<void> {
  const activeAuth = requireActiveAccount(auth);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const r = sandboxStore.replies.find((x) => x.id === replyId && !x.deletedAt);
    if (!r) throw new AppError(404, 'Reply not found.');
    if (r.authorId !== activeAuth.userId) throw new AppError(403, 'You can only delete your own replies.');
    r.deletedAt = now;
    return;
  }

  const admin = getSupabaseAdminClient()!;
  const { data: existing } = await admin
    .from('replies')
    .select('id, author_id')
    .eq('id', replyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) throw new AppError(404, 'Reply not found.');
  if (existing.author_id !== activeAuth.userId) throw new AppError(403, 'You can only delete your own replies.');

  await admin.from('replies').update({ deleted_at: now }).eq('id', replyId);
}

// ---------------------------------------------------------------------------
// REACTIONS (1 active reaction per user per letter, changeable/removable)
// ---------------------------------------------------------------------------
export async function setLetterReaction(
  auth: AuthContext | null,
  letterId: string,
  reactionType: ReactionType | null
): Promise<ReactionSummary> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));

  if (!isSupabaseConfigured()) {
    const letter = sandboxStore.letters.find((l) => l.id === letterId && !l.deletedAt);
    if (!letter || letter.status === 'removed') throw new AppError(404, 'Letter not found.');

    const idx = sandboxStore.reactions.findIndex(
      (r) => r.letterId === letterId && r.userId === activeAuth.userId
    );
    if (reactionType === null) {
      if (idx >= 0) sandboxStore.reactions.splice(idx, 1);
    } else if (idx >= 0) {
      sandboxStore.reactions[idx].reactionType = reactionType;
    } else {
      sandboxStore.reactions.push({
        id: crypto.randomUUID(),
        letterId,
        userId: activeAuth.userId,
        reactionType,
        createdAt: new Date().toISOString(),
      });
      sandboxStore.metrics.reactionSubmitted += 1;
    }
    return formatSandboxLetterDTO(letter, activeAuth.userId).reactions;
  }

  const admin = getSupabaseAdminClient()!;
  if (reactionType === null) {
    await admin.from('reactions').delete().eq('letter_id', letterId).eq('user_id', activeAuth.userId);
  } else {
    await admin.from('reactions').upsert(
      {
        letter_id: letterId,
        user_id: activeAuth.userId,
        reaction_type: reactionType,
      },
      { onConflict: 'letter_id,user_id' }
    );
    await admin.from('analytics_events').insert({ event_type: 'reaction_submitted', letter_id: letterId });
  }

  const { data: rows } = await admin
    .from('reactions')
    .select('user_id, reaction_type')
    .eq('letter_id', letterId);

  const summary = emptyReactionSummary();
  for (const r of rows || []) {
    const rt = r.reaction_type as ReactionType;
    if (REACTION_TYPES.includes(rt)) {
      summary.counts[rt] += 1;
      summary.total += 1;
      if (r.user_id === activeAuth.userId) summary.userReaction = rt;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// SAVED LETTERS (Strictly private to owner)
// ---------------------------------------------------------------------------
export async function toggleSavedLetter(
  auth: AuthContext | null,
  letterId: string,
  save: boolean
): Promise<{ isSaved: boolean }> {
  const activeAuth = requireActiveAccount(auth);
  if (!isSupabaseConfigured()) {
    const idx = sandboxStore.savedLetters.findIndex(
      (s) => s.letterId === letterId && s.userId === activeAuth.userId
    );
    if (save && idx < 0) {
      sandboxStore.savedLetters.push({
        id: crypto.randomUUID(),
        userId: activeAuth.userId,
        letterId,
        createdAt: new Date().toISOString(),
      });
    } else if (!save && idx >= 0) {
      sandboxStore.savedLetters.splice(idx, 1);
    }
    return { isSaved: save };
  }

  const admin = getSupabaseAdminClient()!;
  if (save) {
    await admin
      .from('saved_letters')
      .upsert({ user_id: activeAuth.userId, letter_id: letterId }, { onConflict: 'user_id,letter_id' });
  } else {
    await admin.from('saved_letters').delete().eq('user_id', activeAuth.userId).eq('letter_id', letterId);
  }
  return { isSaved: save };
}

// ---------------------------------------------------------------------------
// PERSONAL DASHBOARD DATA
// ---------------------------------------------------------------------------
export async function getDashboardData(auth: AuthContext): Promise<{
  myLetters: PublicLetterDTO[];
  myReplies: Array<{
    id: string;
    letterId: string;
    letterTitle: string | null;
    body: string;
    status: string;
    createdAt: string;
  }>;
  conversations: PublicLetterDTO[];
  savedLetters: PublicLetterDTO[];
  notifications: NotificationDTO[];
  preferences: NotificationPreferencesDTO;
  blockedAccounts: BlockedAccountDTO[];
  myAppeals: ReportDTO[];
}> {
  if (!isSupabaseConfigured()) {
    const myLetters = sandboxStore.letters
      .filter((l) => l.authorId === auth.userId && !l.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => formatSandboxLetterDTO(l, auth.userId));

    const myRepliesRaw = sandboxStore.replies
      .filter((r) => r.authorId === auth.userId && !r.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const myReplies = myRepliesRaw.map((r) => {
      const l = sandboxStore.letters.find((x) => x.id === r.letterId);
      return {
        id: r.id,
        letterId: r.letterId,
        letterTitle: l?.title ?? null,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt,
      };
    });

    const participatedIds = new Set<string>([
      ...myLetters.map((l) => l.id),
      ...myRepliesRaw.map((r) => r.letterId),
    ]);
    const conversations = sandboxStore.letters
      .filter((l) => participatedIds.has(l.id) && !l.deletedAt)
      .map((l) => formatSandboxLetterDTO(l, auth.userId));

    const savedIds = new Set(
      sandboxStore.savedLetters.filter((s) => s.userId === auth.userId).map((s) => s.letterId)
    );
    const savedLetters = sandboxStore.letters
      .filter((l) => savedIds.has(l.id) && !l.deletedAt && l.status !== 'removed')
      .map((l) => formatSandboxLetterDTO(l, auth.userId));

    const notifications = sandboxStore.notifications
      .filter((n) => n.recipientId === auth.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ recipientId: _r, actorId: _a, ...rest }) => rest);

    const preferences = sandboxStore.notificationPrefs.get(auth.userId) || {
      emailNotificationsEnabled: false,
      replyNotificationsEnabled: true,
      conversationNotificationsEnabled: true,
      marketingOptIn: false,
    };

    const blockedAccounts: BlockedAccountDTO[] = sandboxStore.blocks
      .filter((b) => b.blockerId === auth.userId)
      .map((b) => ({
        id: b.id,
        blockedDisplayName: sandboxStore.profiles.get(b.blockedId)?.displayName || 'Stranger',
        createdAt: b.createdAt,
      }));

    return {
      myLetters,
      myReplies,
      conversations,
      savedLetters,
      notifications,
      preferences,
      blockedAccounts,
      myAppeals: [],
    };
  }

  const admin = getSupabaseAdminClient()!;
  const [myLettersRes, myRepliesRes, savedRes, notifRes, prefsRes, blocksRes] = await Promise.all([
    admin
      .from('letters')
      .select('*')
      .eq('author_id', auth.userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin
      .from('replies')
      .select('id, letter_id, body, status, created_at, letters(title)')
      .eq('author_id', auth.userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin.from('saved_letters').select('letter_id').eq('user_id', auth.userId),
    admin
      .from('notifications')
      .select('*')
      .eq('recipient_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('user_notification_preferences').select('*').eq('user_id', auth.userId).maybeSingle(),
    admin.from('blocks').select('id, blocked_id, created_at').eq('blocker_id', auth.userId),
  ]);

  const myLetters = await enrichSupabaseLetters(
    (myLettersRes.data || []) as Array<Record<string, unknown>>,
    auth.userId
  );

  const myReplies = (myRepliesRes.data || []).map((r) => ({
    id: r.id,
    letterId: r.letter_id,
    letterTitle: (r.letters as { title?: string | null } | null)?.title ?? null,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
  }));

  const convIds = Array.from(
    new Set([...myLetters.map((l) => l.id), ...myReplies.map((r) => r.letterId)])
  );
  const { data: convRows } =
    convIds.length > 0
      ? await admin.from('letters').select('*').in('id', convIds).is('deleted_at', null)
      : { data: [] };
  const conversations = await enrichSupabaseLetters(
    (convRows || []) as Array<Record<string, unknown>>,
    auth.userId
  );

  const savedIds = (savedRes.data || []).map((s) => s.letter_id);
  const { data: savedRows } =
    savedIds.length > 0
      ? await admin
          .from('letters')
          .select('*')
          .in('id', savedIds)
          .in('status', ['published', 'locked'])
          .is('deleted_at', null)
      : { data: [] };
  const savedLetters = await enrichSupabaseLetters(
    (savedRows || []) as Array<Record<string, unknown>>,
    auth.userId
  );

  const notifications: NotificationDTO[] = (notifRes.data || []).map((n) => ({
    id: n.id,
    notificationType: n.notification_type,
    title: n.title,
    body: n.body,
    relatedLetterId: n.related_letter_id,
    relatedReplyId: n.related_reply_id,
    isRead: n.is_read,
    createdAt: n.created_at,
  }));

  const preferences: NotificationPreferencesDTO = {
    emailNotificationsEnabled: prefsRes.data?.email_notifications_enabled ?? false,
    replyNotificationsEnabled: prefsRes.data?.reply_notifications_enabled ?? true,
    conversationNotificationsEnabled: prefsRes.data?.conversation_notifications_enabled ?? true,
    marketingOptIn: prefsRes.data?.marketing_opt_in ?? false,
  };

  const blockedIds = (blocksRes.data || []).map((b) => b.blocked_id);
  const { data: blockedProfiles } =
    blockedIds.length > 0
      ? await admin.from('profiles').select('id, display_name').in('id', blockedIds)
      : { data: [] as Array<{ id: string; display_name: string }> };
  const blockedNameMap = new Map((blockedProfiles || []).map((p) => [p.id, p.display_name]));

  const blockedAccounts: BlockedAccountDTO[] = (blocksRes.data || []).map((b) => ({
    id: b.id,
    blockedDisplayName: blockedNameMap.get(b.blocked_id) || 'Stranger',
    createdAt: b.created_at,
  }));

  return {
    myLetters,
    myReplies,
    conversations,
    savedLetters,
    notifications,
    preferences,
    blockedAccounts,
    myAppeals: [],
  };
}

// ---------------------------------------------------------------------------
// ACCOUNT SETTINGS, NOTIFICATIONS & SAFE DELETION
// ---------------------------------------------------------------------------
export async function updateProfileSettings(
  auth: AuthContext,
  input: {
    displayName?: string;
    preferredTheme?: 'light' | 'dark';
    confirmAge18Plus?: boolean;
    recoveryEmail?: string;
  }
): Promise<ProfileDTO> {
  let nextDisplayName: string | undefined;
  if (input.displayName !== undefined) {
    const parsed = nicknameSchema.safeParse(input.displayName);
    if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid nickname.');
    nextDisplayName = parsed.data;
  }

  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const prof = sandboxStore.profiles.get(auth.userId);
    if (!prof) throw new AppError(404, 'Profile not found.');
    if (nextDisplayName && nextDisplayName !== prof.displayName) {
      const taken = Array.from(sandboxStore.profiles.values()).some(
        (p) => p.id !== prof.id && p.displayName.toLowerCase() === nextDisplayName!.toLowerCase()
      );
      if (taken) throw new AppError(409, 'That anonymous nickname is already taken.');
      prof.displayName = nextDisplayName;
    }
    if (input.preferredTheme) prof.preferredTheme = input.preferredTheme;
    if (input.confirmAge18Plus && !prof.ageConfirmedAt) prof.ageConfirmedAt = now;
    if (input.recoveryEmail) {
      prof.recoveryEmail = input.recoveryEmail.trim();
      prof.recoveryEmailLinked = true;
      prof.isAnonymous = false;
      sandboxStore.notifications.unshift({
        id: crypto.randomUUID(),
        recipientId: prof.id,
        actorId: null,
        notificationType: 'security_event',
        title: 'Recovery email linked (Sandbox)',
        body: 'Your sandbox session is marked with a recovery email for testing.',
        relatedLetterId: null,
        relatedReplyId: null,
        isRead: false,
        createdAt: now,
      });
    }
    return toProfileDTO(prof);
  }

  const admin = getSupabaseAdminClient()!;
  const updates: Record<string, unknown> = {};
  if (nextDisplayName) updates.display_name = nextDisplayName;
  if (input.preferredTheme) updates.preferred_theme = input.preferredTheme;
  if (input.confirmAge18Plus && !auth.profile.ageConfirmedAt) updates.age_confirmed_at = now;

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('profiles').update(updates).eq('id', auth.userId);
    if (error) {
      if (error.code === '23505') throw new AppError(409, 'That anonymous nickname is already taken.');
      throw new AppError(400, error.message);
    }
  }

  const refreshed = await resolveAuthContextFromId(auth.userId, auth);
  return refreshed;
}

async function resolveAuthContextFromId(userId: string, prev: AuthContext): Promise<ProfileDTO> {
  const admin = getSupabaseAdminClient()!;
  const { data } = await admin.from('profiles').select('*').eq('id', userId).single();
  return {
    ...prev.profile,
    displayName: data.display_name,
    preferredTheme: data.preferred_theme,
    ageConfirmedAt: data.age_confirmed_at,
  };
}

export async function updateNotificationPreferences(
  auth: AuthContext,
  prefs: Partial<NotificationPreferencesDTO>
): Promise<NotificationPreferencesDTO> {
  if (!isSupabaseConfigured()) {
    const existing = sandboxStore.notificationPrefs.get(auth.userId) || {
      emailNotificationsEnabled: false,
      replyNotificationsEnabled: true,
      conversationNotificationsEnabled: true,
      marketingOptIn: false,
    };
    const next = { ...existing, ...prefs };
    sandboxStore.notificationPrefs.set(auth.userId, next);
    return next;
  }

  const admin = getSupabaseAdminClient()!;
  const { data, error } = await admin
    .from('user_notification_preferences')
    .upsert({
      user_id: auth.userId,
      email_notifications_enabled: prefs.emailNotificationsEnabled,
      reply_notifications_enabled: prefs.replyNotificationsEnabled,
      conversation_notifications_enabled: prefs.conversationNotificationsEnabled,
      marketing_opt_in: prefs.marketingOptIn ?? false,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error || !data) throw new AppError(500, 'Could not save preferences.');

  return {
    emailNotificationsEnabled: data.email_notifications_enabled,
    replyNotificationsEnabled: data.reply_notifications_enabled,
    conversationNotificationsEnabled: data.conversation_notifications_enabled,
    marketingOptIn: data.marketing_opt_in,
  };
}

export async function markNotificationsRead(auth: AuthContext, notificationId?: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    for (const n of sandboxStore.notifications) {
      if (n.recipientId === auth.userId && (!notificationId || n.id === notificationId)) {
        n.isRead = true;
      }
    }
    return;
  }

  const admin = getSupabaseAdminClient()!;
  let query = admin.from('notifications').update({ is_read: true }).eq('recipient_id', auth.userId);
  if (notificationId) query = query.eq('id', notificationId);
  await query;
}

export async function deleteAccountAndData(auth: AuthContext): Promise<void> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const prof = sandboxStore.profiles.get(auth.userId);
    if (prof) {
      prof.deletedAt = now;
      prof.accountStatus = 'deleted';
      prof.displayName = `Deleted_${prof.id.slice(0, 6)}`;
    }
    for (const l of sandboxStore.letters) {
      if (l.authorId === auth.userId) l.deletedAt = now;
    }
    for (const r of sandboxStore.replies) {
      if (r.authorId === auth.userId) r.deletedAt = now;
    }
    sandboxStore.savedLetters = sandboxStore.savedLetters.filter((s) => s.userId !== auth.userId);
    sandboxStore.notifications = sandboxStore.notifications.filter((n) => n.recipientId !== auth.userId);
    return;
  }

  const admin = getSupabaseAdminClient()!;
  await admin.from('letters').update({ deleted_at: now }).eq('author_id', auth.userId);
  await admin.from('replies').update({ deleted_at: now }).eq('author_id', auth.userId);
  await admin.from('saved_letters').delete().eq('user_id', auth.userId);
  await admin.from('notifications').delete().eq('recipient_id', auth.userId);
  await admin
    .from('profiles')
    .update({
      deleted_at: now,
      account_status: 'deleted',
      display_name: `Deleted_${auth.userId.slice(0, 8)}`,
    })
    .eq('id', auth.userId);
  await admin.auth.admin.deleteUser(auth.userId);
}

// ---------------------------------------------------------------------------
// REPORTING, BLOCKING & APPEALS
// ---------------------------------------------------------------------------
export async function createReport(auth: AuthContext | null, rawInput: unknown): Promise<void> {
  const activeAuth = requireAgeConfirmed(requireActiveAccount(auth));
  const parsed = reportInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || 'Invalid report.');
  }
  const { targetType, targetId, reason, description } = parsed.data;
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    sandboxStore.reports.unshift({
      id: crypto.randomUUID(),
      reporterId: activeAuth.userId,
      targetType,
      targetId,
      reason,
      description: description ?? null,
      status: 'pending',
      appealNote: null,
      appealedAt: null,
      createdAt: now,
      reviewedAt: null,
      reviewedBy: null,
    });
    return;
  }

  const admin = getSupabaseAdminClient()!;
  const { error } = await admin.from('reports').insert({
    reporter_id: activeAuth.userId,
    target_type: targetType,
    target_id: targetId,
    reason,
    description: description ?? null,
  });
  if (error) throw new AppError(500, 'Could not submit report.');
}

export async function blockAuthorByLetterOrReply(
  auth: AuthContext | null,
  input: { letterId?: string; replyId?: string }
): Promise<void> {
  const activeAuth = requireActiveAccount(auth);

  if (!isSupabaseConfigured()) {
    let targetAuthorId: string | null = null;
    if (input.letterId) {
      targetAuthorId = sandboxStore.letters.find((l) => l.id === input.letterId)?.authorId || null;
    } else if (input.replyId) {
      targetAuthorId = sandboxStore.replies.find((r) => r.id === input.replyId)?.authorId || null;
    }
    if (!targetAuthorId) throw new AppError(404, 'Author not found.');
    if (targetAuthorId === activeAuth.userId) throw new AppError(400, 'You cannot block yourself.');

    const exists = sandboxStore.blocks.some(
      (b) => b.blockerId === activeAuth.userId && b.blockedId === targetAuthorId
    );
    if (!exists) {
      sandboxStore.blocks.push({
        id: crypto.randomUUID(),
        blockerId: activeAuth.userId,
        blockedId: targetAuthorId,
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }

  const admin = getSupabaseAdminClient()!;
  let targetAuthorId: string | null = null;
  if (input.letterId) {
    const { data } = await admin.from('letters').select('author_id').eq('id', input.letterId).maybeSingle();
    targetAuthorId = data?.author_id ?? null;
  } else if (input.replyId) {
    const { data } = await admin.from('replies').select('author_id').eq('id', input.replyId).maybeSingle();
    targetAuthorId = data?.author_id ?? null;
  }
  if (!targetAuthorId) throw new AppError(404, 'Author not found.');
  if (targetAuthorId === activeAuth.userId) throw new AppError(400, 'You cannot block yourself.');

  await admin
    .from('blocks')
    .upsert({ blocker_id: activeAuth.userId, blocked_id: targetAuthorId }, { onConflict: 'blocker_id,blocked_id' });
}

export async function removeBlock(auth: AuthContext, blockId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    sandboxStore.blocks = sandboxStore.blocks.filter(
      (b) => !(b.id === blockId && b.blockerId === auth.userId)
    );
    return;
  }
  const admin = getSupabaseAdminClient()!;
  await admin.from('blocks').delete().eq('id', blockId).eq('blocker_id', auth.userId);
}

export async function submitModerationAppeal(auth: AuthContext, note: string): Promise<void> {
  const cleaned = sanitizePlainText(note);
  if (cleaned.length < 10 || cleaned.length > 1500) {
    throw new AppError(400, 'Appeal message must be between 10 and 1500 characters.');
  }
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    sandboxStore.reports.unshift({
      id: crypto.randomUUID(),
      reporterId: auth.userId,
      targetType: 'account',
      targetId: auth.userId,
      reason: 'other',
      description: 'User submitted an appeal for moderation review.',
      status: 'appealed',
      appealNote: cleaned,
      appealedAt: now,
      createdAt: now,
      reviewedAt: null,
      reviewedBy: null,
    });
    return;
  }

  const admin = getSupabaseAdminClient()!;
  await admin.from('reports').insert({
    reporter_id: auth.userId,
    target_type: 'account',
    target_id: auth.userId,
    reason: 'other',
    description: 'User submitted an appeal for moderation review.',
    status: 'appealed',
    appeal_note: cleaned,
    appealed_at: now,
  });
}

// ---------------------------------------------------------------------------
// ADMIN & MODERATION CONSOLE (Server-verified admin only)
// ---------------------------------------------------------------------------
async function recordModerationAction(
  moderatorId: string,
  targetType: 'letter' | 'reply' | 'account' | 'report',
  targetId: string,
  actionType: string,
  reason: string,
  internalNotes: string | null = null
): Promise<void> {
  if (!isSupabaseConfigured()) {
    sandboxStore.moderationActions.unshift({
      id: crypto.randomUUID(),
      moderatorId,
      targetType,
      targetId,
      actionType,
      reason,
      internalNotes,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const admin = getSupabaseAdminClient()!;
  await admin.from('moderation_actions').insert({
    moderator_id: moderatorId,
    target_type: targetType,
    target_id: targetId,
    action_type: actionType,
    reason,
    internal_notes: internalNotes,
  });
}

export async function getModerationConsoleData(auth: AuthContext | null): Promise<{
  reports: ReportDTO[];
  flaggedLetters: PublicLetterDTO[];
  auditTrail: ModerationActionDTO[];
  metrics: AggregateMetricsDTO;
  letterOfTheDayId: string | null;
  announcement: { active: boolean; message: string };
}> {
  requireAdmin(auth);

  if (!isSupabaseConfigured()) {
    const reports: ReportDTO[] = sandboxStore.reports.map((r) => {
      let targetPreview = '';
      let targetAuthorDisplayName = '';
      let targetStatus = '';
      if (r.targetType === 'letter') {
        const l = sandboxStore.letters.find((x) => x.id === r.targetId);
        targetPreview = l ? `${l.title ? l.title + ': ' : ''}${l.body.slice(0, 140)}` : 'Deleted letter';
        targetAuthorDisplayName = l ? sandboxStore.profiles.get(l.authorId)?.displayName || 'Stranger' : '';
        targetStatus = l?.status || 'deleted';
      } else if (r.targetType === 'reply') {
        const rep = sandboxStore.replies.find((x) => x.id === r.targetId);
        targetPreview = rep ? rep.body.slice(0, 140) : 'Deleted reply';
        targetAuthorDisplayName = rep ? sandboxStore.profiles.get(rep.authorId)?.displayName || 'Stranger' : '';
        targetStatus = rep?.status || 'deleted';
      } else {
        const p = sandboxStore.profiles.get(r.targetId);
        targetPreview = p ? `Account: ${p.displayName}` : 'Account';
        targetAuthorDisplayName = p?.displayName || '';
        targetStatus = p?.accountStatus || 'unknown';
      }
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        description: r.description,
        status: r.status,
        appealNote: r.appealNote,
        appealedAt: r.appealedAt,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        targetPreview,
        targetAuthorDisplayName,
        targetStatus,
      };
    });

    const flaggedLetters = sandboxStore.letters
      .filter((l) => !l.deletedAt && (l.status === 'flagged_for_review' || l.isFlaggedSafety))
      .map((l) => formatSandboxLetterDTO(l, auth!.userId));

    const auditTrail: ModerationActionDTO[] = sandboxStore.moderationActions.map((m) => ({
      id: m.id,
      moderatorDisplayName: sandboxStore.profiles.get(m.moderatorId)?.displayName || 'Moderator',
      targetType: m.targetType,
      targetId: m.targetId,
      actionType: m.actionType,
      reason: m.reason,
      internalNotes: m.internalNotes,
      createdAt: m.createdAt,
    }));

    return {
      reports,
      flaggedLetters,
      auditTrail,
      metrics: sandboxStore.metrics,
      letterOfTheDayId: sandboxStore.letterOfTheDayId,
      announcement: sandboxStore.platformAnnouncement,
    };
  }

  const admin = getSupabaseAdminClient()!;
  const [reportsRes, flaggedRes, actionsRes, analyticsRes, lotdRes, annRes] = await Promise.all([
    admin.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
    admin
      .from('letters')
      .select('*')
      .is('deleted_at', null)
      .or('status.eq.flagged_for_review,is_flagged_safety.eq.true')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('analytics_events').select('event_type'),
    admin.from('platform_settings').select('value').eq('key', 'letter_of_the_day').maybeSingle(),
    admin.from('platform_settings').select('value').eq('key', 'platform_announcement').maybeSingle(),
  ]);

  const flaggedLetters = await enrichSupabaseLetters(
    (flaggedRes.data || []) as Array<Record<string, unknown>>,
    auth!.userId
  );

  const modIds = Array.from(new Set((actionsRes.data || []).map((a) => a.moderator_id)));
  const { data: modProfiles } =
    modIds.length > 0
      ? await admin.from('profiles').select('id, display_name').in('id', modIds)
      : { data: [] as Array<{ id: string; display_name: string }> };
  const modNameMap = new Map((modProfiles || []).map((p) => [p.id, p.display_name]));

  const metrics: AggregateMetricsDTO = {
    letterSubmitted: 0,
    replySubmitted: 0,
    letterShared: 0,
    letterOpened: 0,
    reactionSubmitted: 0,
    firstReplyReceived: 0,
    returnParticipation: 0,
  };
  for (const ev of analyticsRes.data || []) {
    if (ev.event_type === 'letter_submitted') metrics.letterSubmitted += 1;
    if (ev.event_type === 'reply_submitted') metrics.replySubmitted += 1;
    if (ev.event_type === 'letter_shared') metrics.letterShared += 1;
    if (ev.event_type === 'letter_opened') metrics.letterOpened += 1;
    if (ev.event_type === 'reaction_submitted') metrics.reactionSubmitted += 1;
    if (ev.event_type === 'first_reply_received') metrics.firstReplyReceived += 1;
    if (ev.event_type === 'return_participation') metrics.returnParticipation += 1;
  }

  return {
    reports: (reportsRes.data || []).map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason as ReportReason,
      description: r.description,
      status: r.status,
      appealNote: r.appeal_note,
      appealedAt: r.appealed_at,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    })),
    flaggedLetters,
    auditTrail: (actionsRes.data || []).map((a) => ({
      id: a.id,
      moderatorDisplayName: modNameMap.get(a.moderator_id) || 'Moderator',
      targetType: a.target_type,
      targetId: a.target_id,
      actionType: a.action_type,
      reason: a.reason,
      internalNotes: a.internal_notes,
      createdAt: a.created_at,
    })),
    metrics,
    letterOfTheDayId: (lotdRes.data?.value as { letter_id?: string | null } | undefined)?.letter_id ?? null,
    announcement: {
      active: Boolean((annRes.data?.value as { active?: boolean } | undefined)?.active),
      message: (annRes.data?.value as { message?: string } | undefined)?.message || '',
    },
  };
}

export async function executeModerationDecision(
  auth: AuthContext | null,
  input: {
    reportId?: string;
    targetType: 'letter' | 'reply' | 'account' | 'report';
    targetId: string;
    actionType:
      | 'remove_content'
      | 'restore_content'
      | 'lock_conversation'
      | 'unlock_conversation'
      | 'restrict_account'
      | 'suspend_account'
      | 'restore_account'
      | 'dismiss_report';
    reason: string;
    internalNotes?: string;
  }
): Promise<void> {
  const mod = requireAdmin(auth);
  const reason = sanitizePlainText(input.reason);
  const notes = input.internalNotes ? sanitizePlainText(input.internalNotes) : null;
  if (!reason) throw new AppError(400, 'Please provide a moderation reason.');
  const now = new Date().toISOString();

  const notifyRecipient = async (recipientId: string, title: string, msg: string, letterId: string | null = null) => {
    if (!isSupabaseConfigured()) {
      sandboxStore.notifications.unshift({
        id: crypto.randomUUID(),
        recipientId,
        actorId: null,
        notificationType: 'moderation_decision',
        title,
        body: msg,
        relatedLetterId: letterId,
        relatedReplyId: null,
        isRead: false,
        createdAt: now,
      });
      return;
    }
    const admin = getSupabaseAdminClient()!;
    await admin.from('notifications').insert({
      recipient_id: recipientId,
      actor_id: null,
      notification_type: 'moderation_decision',
      title,
      body: msg,
      related_letter_id: letterId,
    });
  };

  if (!isSupabaseConfigured()) {
    if (input.targetType === 'letter') {
      const l = sandboxStore.letters.find((x) => x.id === input.targetId);
      if (!l) throw new AppError(404, 'Letter not found.');
      if (input.actionType === 'remove_content') l.status = 'removed';
      if (input.actionType === 'restore_content') {
        l.status = 'published';
        l.isFlaggedSafety = false;
        if (!l.publishedAt) l.publishedAt = now;
      }
      if (input.actionType === 'lock_conversation') l.status = 'locked';
      if (input.actionType === 'unlock_conversation') l.status = 'published';
      await notifyRecipient(
        l.authorId,
        'Moderation update on your letter',
        `Action: ${input.actionType.replace(/_/g, ' ')}. Reason: ${reason}`,
        l.id
      );
    } else if (input.targetType === 'reply') {
      const rep = sandboxStore.replies.find((x) => x.id === input.targetId);
      if (!rep) throw new AppError(404, 'Reply not found.');
      if (input.actionType === 'remove_content') rep.status = 'removed';
      if (input.actionType === 'restore_content') rep.status = 'published';
      await notifyRecipient(
        rep.authorId,
        'Moderation update on your reply',
        `Action: ${input.actionType.replace(/_/g, ' ')}. Reason: ${reason}`,
        rep.letterId
      );
    } else if (input.targetType === 'account') {
      const prof = sandboxStore.profiles.get(input.targetId);
      if (!prof) throw new AppError(404, 'Account not found.');
      if (input.actionType === 'restrict_account') {
        prof.accountStatus = 'restricted';
        prof.restrictionReason = reason;
      }
      if (input.actionType === 'suspend_account') {
        prof.accountStatus = 'suspended';
        prof.restrictionReason = reason;
      }
      if (input.actionType === 'restore_account') {
        prof.accountStatus = 'active';
        prof.restrictionReason = null;
      }
      await notifyRecipient(prof.id, 'Account moderation notice', `Status updated: ${prof.accountStatus}. Reason: ${reason}`);
    }

    if (input.reportId) {
      const rep = sandboxStore.reports.find((r) => r.id === input.reportId);
      if (rep) {
        rep.status = input.actionType === 'dismiss_report' ? 'dismissed' : 'reviewed_action_taken';
        rep.reviewedAt = now;
        rep.reviewedBy = mod.userId;
      }
    }
    await recordModerationAction(mod.userId, input.targetType, input.targetId, input.actionType, reason, notes);
    return;
  }

  const admin = getSupabaseAdminClient()!;
  if (input.targetType === 'letter') {
    const { data: l } = await admin.from('letters').select('id, author_id, published_at').eq('id', input.targetId).maybeSingle();
    if (!l) throw new AppError(404, 'Letter not found.');
    if (input.actionType === 'remove_content') await admin.from('letters').update({ status: 'removed' }).eq('id', l.id);
    if (input.actionType === 'restore_content') {
      await admin
        .from('letters')
        .update({ status: 'published', is_flagged_safety: false, published_at: l.published_at || now })
        .eq('id', l.id);
    }
    if (input.actionType === 'lock_conversation') await admin.from('letters').update({ status: 'locked' }).eq('id', l.id);
    if (input.actionType === 'unlock_conversation') await admin.from('letters').update({ status: 'published' }).eq('id', l.id);
    await notifyRecipient(
      l.author_id,
      'Moderation update on your letter',
      `Action: ${input.actionType.replace(/_/g, ' ')}. Reason: ${reason}`,
      l.id
    );
  } else if (input.targetType === 'reply') {
    const { data: rep } = await admin.from('replies').select('id, author_id, letter_id').eq('id', input.targetId).maybeSingle();
    if (!rep) throw new AppError(404, 'Reply not found.');
    if (input.actionType === 'remove_content') await admin.from('replies').update({ status: 'removed' }).eq('id', rep.id);
    if (input.actionType === 'restore_content') await admin.from('replies').update({ status: 'published' }).eq('id', rep.id);
    await notifyRecipient(
      rep.author_id,
      'Moderation update on your reply',
      `Action: ${input.actionType.replace(/_/g, ' ')}. Reason: ${reason}`,
      rep.letter_id
    );
  } else if (input.targetType === 'account') {
    if (input.actionType === 'restrict_account') {
      await admin.from('profiles').update({ account_status: 'restricted', restriction_reason: reason }).eq('id', input.targetId);
    }
    if (input.actionType === 'suspend_account') {
      await admin.from('profiles').update({ account_status: 'suspended', restriction_reason: reason }).eq('id', input.targetId);
    }
    if (input.actionType === 'restore_account') {
      await admin.from('profiles').update({ account_status: 'active', restriction_reason: null }).eq('id', input.targetId);
    }
    await notifyRecipient(input.targetId, 'Account moderation notice', `Reason: ${reason}`);
  }

  if (input.reportId) {
    await admin
      .from('reports')
      .update({
        status: input.actionType === 'dismiss_report' ? 'dismissed' : 'reviewed_action_taken',
        reviewed_at: now,
        reviewed_by: mod.userId,
      })
      .eq('id', input.reportId);
  }

  await recordModerationAction(mod.userId, input.targetType, input.targetId, input.actionType, reason, notes);
}

export async function setLetterOfTheDay(
  auth: AuthContext | null,
  letterId: string | null,
  editorNote: string | null
): Promise<void> {
  const mod = requireAdmin(auth);
  if (letterId) {
    if (!isSupabaseConfigured()) {
      const l = sandboxStore.letters.find(
        (x) => x.id === letterId && x.visibility === 'public' && x.status === 'published' && !x.deletedAt
      );
      if (!l) throw new AppError(400, 'Only active public letters can be featured as Letter of the Day.');
      sandboxStore.letterOfTheDayId = letterId;
    } else {
      const admin = getSupabaseAdminClient()!;
      const { data: l } = await admin
        .from('letters')
        .select('id')
        .eq('id', letterId)
        .eq('visibility', 'public')
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle();
      if (!l) throw new AppError(400, 'Only active public letters can be featured as Letter of the Day.');
      await admin.from('platform_settings').upsert({
        key: 'letter_of_the_day',
        value: { letter_id: letterId, editor_note: editorNote || null },
        updated_by: mod.userId,
        updated_at: new Date().toISOString(),
      });
    }
  } else {
    if (!isSupabaseConfigured()) {
      sandboxStore.letterOfTheDayId = null;
    } else {
      const admin = getSupabaseAdminClient()!;
      await admin.from('platform_settings').upsert({
        key: 'letter_of_the_day',
        value: { letter_id: null, editor_note: null },
        updated_by: mod.userId,
        updated_at: new Date().toISOString(),
      });
    }
  }
  await recordModerationAction(
    mod.userId,
    'letter',
    letterId || mod.userId,
    'set_letter_of_the_day',
    letterId ? 'Featured as Letter of the Day' : 'Cleared Letter of the Day'
  );
}

export async function setPlatformAnnouncement(
  auth: AuthContext | null,
  active: boolean,
  message: string
): Promise<void> {
  const mod = requireAdmin(auth);
  const cleanMsg = sanitizePlainText(message).slice(0, 280);
  if (!isSupabaseConfigured()) {
    sandboxStore.platformAnnouncement = { active: active && Boolean(cleanMsg), message: cleanMsg };
  } else {
    const admin = getSupabaseAdminClient()!;
    await admin.from('platform_settings').upsert({
      key: 'platform_announcement',
      value: { active: active && Boolean(cleanMsg), message: cleanMsg },
      updated_by: mod.userId,
      updated_at: new Date().toISOString(),
    });
  }
  await recordModerationAction(mod.userId, 'report', mod.userId, 'update_announcement', cleanMsg || 'Cleared announcement');
}

export async function recordShareEvent(letterId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    sandboxStore.metrics.letterShared += 1;
    return;
  }
  const admin = getSupabaseAdminClient();
  if (admin) {
    await admin.from('analytics_events').insert({ event_type: 'letter_shared', letter_id: letterId });
  }
}
