export const MIN_LETTER_LENGTH = 20;
export const MAX_LETTER_LENGTH = 10000;
export const MAX_TITLE_LENGTH = 160;
export const MIN_REPLY_LENGTH = 2;
export const MAX_REPLY_LENGTH = 3000;

export const REACTION_TYPES = [
  'i_hear_you',
  'sending_strength',
  'i_understand',
  'made_me_smile',
  'thank_you',
] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  i_hear_you: '👍',
  sending_strength: '🫂',
  i_understand: '🤍',
  made_me_smile: '🥹',
  thank_you: '🙏',
};

export const REACTION_LABELS: Record<ReactionType, string> = {
  i_hear_you: 'Like — I hear you',
  sending_strength: 'Sending strength',
  i_understand: 'Warm empathy',
  made_me_smile: 'Touched / made me smile',
  thank_you: 'Thank you for sharing',
};

export const REPORT_REASONS = [
  'harassment',
  'threats',
  'hate_abuse',
  'spam_scams',
  'sexual_exploitation',
  'personal_info',
  'self_harm',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  threats: 'Threats of violence',
  hate_abuse: 'Hate or discriminatory abuse',
  spam_scams: 'Spam or scams',
  sexual_exploitation: 'Sexual exploitation',
  personal_info: 'Personal information exposure',
  self_harm: 'Self-harm or immediate safety concern',
  other: 'Other',
};

export type LetterVisibility = 'public' | 'unlisted' | 'private_reserved';
export type LetterStatus = 'draft' | 'published' | 'flagged_for_review' | 'removed' | 'locked';
export type AccountStatus = 'active' | 'restricted' | 'suspended' | 'deleted';

export type OpenLetterboxPromptLabel =
  | 'Someone wants to be heard'
  | 'Someone has a question'
  | 'Someone needs encouragement'
  | 'Someone needs another perspective';

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

export interface ReactionSummary {
  counts: Record<ReactionType, number>;
  total: number;
  userReaction: ReactionType | null;
}

export interface PublicLetterDTO {
  id: string;
  title: string | null;
  body: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  authorDisplayName: string;
  visibility: 'public' | 'unlisted';
  status: LetterStatus;
  allowExternalSharing: boolean;
  language: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  reactions: ReactionSummary;
  isOwner: boolean;
  isSaved: boolean;
  openLetterboxLabel?: OpenLetterboxPromptLabel;
  isSandboxSample?: boolean;
}

export interface ReplyDTO {
  id: string;
  letterId: string;
  parentReplyId: string | null;
  authorDisplayName: string;
  isLetterAuthor: boolean;
  isOwner: boolean;
  body: string;
  status: 'published' | 'flagged_for_review' | 'removed';
  createdAt: string;
  updatedAt: string;
  children: ReplyDTO[];
}

export type AuthProviderName = 'anonymous' | 'google' | 'email';

export interface ProfileDTO {
  id: string;
  displayName: string;
  accountStatus: AccountStatus;
  preferredTheme: 'light' | 'dark';
  preferredLanguage: string;
  ageConfirmedAt: string | null;
  isAnonymous: boolean;
  recoveryEmailLinked: boolean;
  googleLinked?: boolean;
  authProviders?: AuthProviderName[];
  restrictionReason: string | null;
  isAdmin: boolean;
  adminRole: 'moderator' | 'admin' | 'super_admin' | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  notificationType:
    | 'reply_to_letter'
    | 'response_to_reply'
    | 'security_event'
    | 'moderation_decision';
  title: string;
  body: string;
  relatedLetterId: string | null;
  relatedReplyId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferencesDTO {
  emailNotificationsEnabled: boolean;
  replyNotificationsEnabled: boolean;
  conversationNotificationsEnabled: boolean;
  marketingOptIn: boolean;
}

export interface BlockedAccountDTO {
  id: string;
  blockedDisplayName: string;
  createdAt: string;
}

export interface ReportDTO {
  id: string;
  targetType: 'letter' | 'reply' | 'account';
  targetId: string;
  reason: ReportReason;
  description: string | null;
  status: 'pending' | 'reviewed_action_taken' | 'dismissed' | 'appealed';
  appealNote: string | null;
  appealedAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  targetPreview?: string;
  targetAuthorDisplayName?: string;
  targetStatus?: string;
}

export interface ModerationActionDTO {
  id: string;
  moderatorDisplayName: string;
  targetType: 'letter' | 'reply' | 'account' | 'report';
  targetId: string;
  actionType: string;
  reason: string;
  internalNotes: string | null;
  createdAt: string;
}

export interface PlatformConfigDTO {
  supabaseConfigured: boolean;
  supabaseSchemaReady?: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  turnstileSiteKey: string | null;
  emailConfigured: boolean;
  sandboxActive: boolean;
  sandboxHasSamples: boolean;
  staticFallback?: boolean;
  platformAnnouncement: {
    active: boolean;
    message: string;
  };
}

export interface AggregateMetricsDTO {
  letterSubmitted: number;
  replySubmitted: number;
  letterShared: number;
  letterOpened: number;
  reactionSubmitted: number;
  firstReplyReceived: number;
  returnParticipation: number;
}
