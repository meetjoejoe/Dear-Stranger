import crypto from 'node:crypto';
import type {
  AccountStatus,
  AggregateMetricsDTO,
  CategoryDTO,
  LetterStatus,
  NotificationDTO,
  NotificationPreferencesDTO,
  ReactionType,
  ReportReason,
} from '../src/shared/types.ts';
import { generateAnonymousNickname } from '../src/shared/validation.ts';

export interface SandboxProfile {
  id: string;
  displayName: string;
  accountStatus: AccountStatus;
  preferredTheme: 'light' | 'dark';
  preferredLanguage: string;
  ageConfirmedAt: string | null;
  isAnonymous: boolean;
  recoveryEmailLinked: boolean;
  recoveryEmail: string | null;
  restrictionReason: string | null;
  isAdmin: boolean;
  adminRole: 'moderator' | 'admin' | 'super_admin' | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface SandboxLetter {
  id: string;
  authorId: string;
  title: string | null;
  body: string;
  categoryId: string;
  visibility: 'public' | 'unlisted' | 'private_reserved';
  status: LetterStatus;
  allowExternalSharing: boolean;
  isFlaggedSafety: boolean;
  safetyFlagReason: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  isSandboxSample: boolean;
}

export interface SandboxReply {
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

export interface SandboxReaction {
  id: string;
  letterId: string;
  userId: string;
  reactionType: ReactionType;
  createdAt: string;
}

export interface SandboxSavedLetter {
  id: string;
  userId: string;
  letterId: string;
  createdAt: string;
}

export interface SandboxReport {
  id: string;
  reporterId: string;
  targetType: 'letter' | 'reply' | 'account';
  targetId: string;
  reason: ReportReason;
  description: string | null;
  status: 'pending' | 'reviewed_action_taken' | 'dismissed' | 'appealed';
  appealNote: string | null;
  appealedAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface SandboxBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface SandboxModerationAction {
  id: string;
  moderatorId: string;
  targetType: 'letter' | 'reply' | 'account' | 'report';
  targetId: string;
  actionType: string;
  reason: string;
  internalNotes: string | null;
  createdAt: string;
}

const INITIAL_CATEGORIES: CategoryDTO[] = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Life', slug: 'life', description: 'Everyday reflections, turning points, and quiet observations.', is_active: true, sort_order: 1 },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Relationships', slug: 'relationships', description: 'Love, friendship, heartbreak, boundaries, and human connection.', is_active: true, sort_order: 2 },
  { id: '11111111-1111-4111-8111-111111111103', name: 'Family', slug: 'family', description: 'Parents, siblings, heritage, duty, and domestic life.', is_active: true, sort_order: 3 },
  { id: '11111111-1111-4111-8111-111111111104', name: 'School & Career', slug: 'school-and-career', description: 'Ambition, burnout, uncertainty, studying, and work.', is_active: true, sort_order: 4 },
  { id: '11111111-1111-4111-8111-111111111105', name: 'Personal Growth', slug: 'personal-growth', description: 'Becoming yourself, letting go, habits, and inner change.', is_active: true, sort_order: 5 },
  { id: '11111111-1111-4111-8111-111111111106', name: 'Confessions', slug: 'confessions', description: 'Truths rarely spoken aloud, regrets, and unburdened secrets.', is_active: true, sort_order: 6 },
  { id: '11111111-1111-4111-8111-111111111107', name: 'Questions', slug: 'questions', description: 'Honest questions for strangers with different life experiences.', is_active: true, sort_order: 7 },
  { id: '11111111-1111-4111-8111-111111111108', name: 'Random Thoughts', slug: 'random-thoughts', description: 'Late-night ponderings, fragments, and passing wonder.', is_active: true, sort_order: 8 },
];

class SandboxStore {
  profiles = new Map<string, SandboxProfile>();
  tokens = new Map<string, string>(); // token -> userId
  categories: CategoryDTO[] = structuredClone(INITIAL_CATEGORIES);
  letters: SandboxLetter[] = [];
  replies: SandboxReply[] = [];
  reactions: SandboxReaction[] = [];
  savedLetters: SandboxSavedLetter[] = [];
  notifications: Array<NotificationDTO & { recipientId: string; actorId: string | null }> = [];
  notificationPrefs = new Map<string, NotificationPreferencesDTO>();
  reports: SandboxReport[] = [];
  blocks: SandboxBlock[] = [];
  moderationActions: SandboxModerationAction[] = [];
  letterOfTheDayId: string | null = null;
  platformAnnouncement: { active: boolean; message: string } = { active: false, message: '' };
  metrics: AggregateMetricsDTO = {
    letterSubmitted: 0,
    replySubmitted: 0,
    letterShared: 0,
    letterOpened: 0,
    reactionSubmitted: 0,
    firstReplyReceived: 0,
    returnParticipation: 0,
  };
  samplesLoaded = false;

  createSession(options?: { asAdmin?: boolean }): { token: string; profile: SandboxProfile } {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let displayName = generateAnonymousNickname();
    const existingNames = new Set(Array.from(this.profiles.values()).map((p) => p.displayName));
    while (existingNames.has(displayName)) {
      displayName = generateAnonymousNickname();
    }

    const profile: SandboxProfile = {
      id,
      displayName,
      accountStatus: 'active',
      preferredTheme: 'light',
      preferredLanguage: 'en',
      ageConfirmedAt: null,
      isAnonymous: true,
      recoveryEmailLinked: false,
      recoveryEmail: null,
      restrictionReason: null,
      isAdmin: Boolean(options?.asAdmin),
      adminRole: options?.asAdmin ? 'admin' : null,
      createdAt: now,
      deletedAt: null,
    };

    this.profiles.set(id, profile);
    this.notificationPrefs.set(id, {
      emailNotificationsEnabled: false,
      replyNotificationsEnabled: true,
      conversationNotificationsEnabled: true,
      marketingOptIn: false,
    });

    const token = `sbx_${crypto.randomBytes(24).toString('hex')}`;
    this.tokens.set(token, id);
    return { token, profile };
  }

  getProfileByToken(token: string | null): SandboxProfile | null {
    if (!token) return null;
    const uid = this.tokens.get(token);
    if (!uid) return null;
    const prof = this.profiles.get(uid) || null;
    if (!prof || prof.deletedAt) return null;
    return prof;
  }

  loadSamples(): void {
    if (this.samplesLoaded) return;
    const sampleAuthorA = '99999999-9999-4999-8999-999999999901';
    const sampleAuthorB = '99999999-9999-4999-8999-999999999902';
    const sampleAuthorC = '99999999-9999-4999-8999-999999999903';
    const now = Date.now();

    const ensureSampleProfile = (id: string, displayName: string) => {
      if (!this.profiles.has(id)) {
        this.profiles.set(id, {
          id,
          displayName,
          accountStatus: 'active',
          preferredTheme: 'light',
          preferredLanguage: 'en',
          ageConfirmedAt: new Date(now - 86400_000 * 5).toISOString(),
          isAnonymous: true,
          recoveryEmailLinked: false,
          recoveryEmail: null,
          restrictionReason: null,
          isAdmin: false,
          adminRole: null,
          createdAt: new Date(now - 86400_000 * 5).toISOString(),
          deletedAt: null,
        });
      }
    };

    ensureSampleProfile(sampleAuthorA, 'PaperMoon_14');
    ensureSampleProfile(sampleAuthorB, 'WanderingInk_08');
    ensureSampleProfile(sampleAuthorC, 'SilentCloud_27');

    const l1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
    const l2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';
    const l3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03';
    const l4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04';

    const sampleLetters: SandboxLetter[] = [
      {
        id: l1,
        authorId: sampleAuthorA,
        title: '[Sandbox Sample] Learning to start over at thirty-two',
        body:
          'I spent seven years building a career everyone around me admired, and last month I quietly handed in my notice. Not because of a scandal or a sudden windfall, only because I realised I had stopped recognising the person checking her phone at six every morning.\n\nEveryone I know wants an optimistic five-year plan. The honest truth is I do not have one yet. I just wanted to say aloud, somewhere without applause or expectations, that sitting in the uncertainty feels terrifying and oddly peaceful at the same time.',
        categoryId: '11111111-1111-4111-8111-111111111104',
        visibility: 'public',
        status: 'published',
        allowExternalSharing: true,
        isFlaggedSafety: false,
        safetyFlagReason: null,
        language: 'en',
        createdAt: new Date(now - 3600_000 * 6).toISOString(),
        updatedAt: new Date(now - 3600_000 * 6).toISOString(),
        publishedAt: new Date(now - 3600_000 * 6).toISOString(),
        deletedAt: null,
        isSandboxSample: true,
      },
      {
        id: l2,
        authorId: sampleAuthorB,
        title: '[Sandbox Sample] How do you forgive a parent who never apologised?',
        body:
          'My father calls every Sunday now to talk about the weather and ask if I have eaten well. Ten years ago we barely spoke, and there are conversations from my childhood that still sit heavily in my chest whenever I hear his voice.\n\nHe is older now, gentler in small ways, yet he has never once said he was sorry. Part of me thinks letting go is a gift I give myself. Another part wonders if pretending nothing happened is a kind of self-betrayal. If you have navigated this, how did you find steadiness?',
        categoryId: '11111111-1111-4111-8111-111111111103',
        visibility: 'public',
        status: 'published',
        allowExternalSharing: true,
        isFlaggedSafety: false,
        safetyFlagReason: null,
        language: 'en',
        createdAt: new Date(now - 3600_000 * 14).toISOString(),
        updatedAt: new Date(now - 3600_000 * 14).toISOString(),
        publishedAt: new Date(now - 3600_000 * 14).toISOString(),
        deletedAt: null,
        isSandboxSample: true,
      },
      {
        id: l3,
        authorId: sampleAuthorC,
        title: '[Sandbox Sample] To the stranger who returned my notebook on the bus',
        body:
          'It only had grocery lists, half-written paragraphs, and three years of scribbled reminders inside, so to anyone else it probably looked worthless. You handed it back before I even noticed it had slipped out of my bag, and you did not wait around for thanks.\n\nIf you ever wonder whether small quiet kindnesses stay with people, yours stayed with me all week.',
        categoryId: '11111111-1111-4111-8111-111111111101',
        visibility: 'public',
        status: 'published',
        allowExternalSharing: true,
        isFlaggedSafety: false,
        safetyFlagReason: null,
        language: 'en',
        createdAt: new Date(now - 3600_000 * 24).toISOString(),
        updatedAt: new Date(now - 3600_000 * 24).toISOString(),
        publishedAt: new Date(now - 3600_000 * 24).toISOString(),
        deletedAt: null,
        isSandboxSample: true,
      },
      {
        id: l4,
        authorId: sampleAuthorA,
        title: '[Sandbox Sample] What small ritual keeps you grounded when life feels loud?',
        body:
          'Lately every hour feels occupied by notifications, obligations, and comparisons. I am trying to rebuild a quieter rhythm in the evenings. What is one ordinary, unglamorous habit that genuinely helps you exhale at the end of the day?',
        categoryId: '11111111-1111-4111-8111-111111111107',
        visibility: 'public',
        status: 'published',
        allowExternalSharing: true,
        isFlaggedSafety: false,
        safetyFlagReason: null,
        language: 'en',
        createdAt: new Date(now - 3600_000 * 32).toISOString(),
        updatedAt: new Date(now - 3600_000 * 32).toISOString(),
        publishedAt: new Date(now - 3600_000 * 32).toISOString(),
        deletedAt: null,
        isSandboxSample: true,
      },
    ];

    for (const sl of sampleLetters) {
      if (!this.letters.some((x) => x.id === sl.id)) {
        this.letters.push(sl);
      }
    }

    const r1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
    if (!this.replies.some((x) => x.id === r1)) {
      this.replies.push({
        id: r1,
        letterId: l1,
        authorId: sampleAuthorB,
        parentReplyId: null,
        body: 'Walking away from something that looks successful on paper takes real quiet courage. Give yourself permission not to have the next chapter neatly outlined in week four.',
        status: 'published',
        createdAt: new Date(now - 3600_000 * 4).toISOString(),
        updatedAt: new Date(now - 3600_000 * 4).toISOString(),
        deletedAt: null,
      });
    }

    this.letterOfTheDayId = l1;
    this.samplesLoaded = true;
  }

  reset(): void {
    this.letters = [];
    this.replies = [];
    this.reactions = [];
    this.savedLetters = [];
    this.notifications = [];
    this.reports = [];
    this.blocks = [];
    this.moderationActions = [];
    this.letterOfTheDayId = null;
    this.platformAnnouncement = { active: false, message: '' };
    this.samplesLoaded = false;
  }
}

export const sandboxStore = new SandboxStore();
