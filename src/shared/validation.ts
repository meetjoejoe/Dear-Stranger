import { z } from 'zod';
import {
  MAX_LETTER_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_LETTER_LENGTH,
  MIN_REPLY_LENGTH,
  REACTION_TYPES,
  REPORT_REASONS,
} from './types.ts';

export function sanitizePlainText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export const letterInputSchema = z
  .object({
    title: z
      .string()
      .max(MAX_TITLE_LENGTH, `Title cannot exceed ${MAX_TITLE_LENGTH} characters.`)
      .optional()
      .nullable()
      .transform((val) => {
        if (!val) return null;
        const cleaned = sanitizePlainText(val);
        return cleaned.length > 0 ? cleaned : null;
      }),
    body: z.string().transform(sanitizePlainText),
    categoryId: z.string().uuid('Please choose a valid category.'),
    visibility: z.enum(['public', 'unlisted']),
    status: z.enum(['draft', 'published']).default('published'),
    allowExternalSharing: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'published' && data.body.length < MIN_LETTER_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `Please write at least ${MIN_LETTER_LENGTH} characters before publishing.`,
      });
    }
    if (data.body.length > MAX_LETTER_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: `Letters cannot exceed ${MAX_LETTER_LENGTH} characters.`,
      });
    }
  });

export const replyInputSchema = z.object({
  body: z
    .string()
    .transform(sanitizePlainText)
    .refine((val) => val.length >= MIN_REPLY_LENGTH, {
      message: `Replies must be at least ${MIN_REPLY_LENGTH} characters.`,
    })
    .refine((val) => val.length <= MAX_REPLY_LENGTH, {
      message: `Replies cannot exceed ${MAX_REPLY_LENGTH} characters.`,
    }),
  parentReplyId: z.string().uuid().nullable().optional(),
});

export const reactionInputSchema = z.object({
  reactionType: z.enum(REACTION_TYPES).nullable(),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export const reportInputSchema = z.object({
  targetType: z.enum(['letter', 'reply', 'account']),
  targetId: z.string().uuid('Invalid report target identifier.'),
  reason: z.enum(REPORT_REASONS),
  description: z
    .string()
    .max(1000, 'Details cannot exceed 1000 characters.')
    .optional()
    .nullable()
    .transform((v) => (v ? sanitizePlainText(v) : null)),
});

export const nicknameSchema = z
  .string()
  .transform(sanitizePlainText)
  .refine((v) => v.length >= 3 && v.length <= 32, {
    message: 'Display nickname must be between 3 and 32 characters.',
  })
  .refine((v) => /^[a-zA-Z0-9_]+$/.test(v), {
    message: 'Use only letters, numbers, and underscores.',
  });

export interface SafetyScreeningResult {
  requiresModeratorReview: boolean;
  flagReason: string | null;
  imminentHarmDetected: boolean;
}

const IMMINENT_HARM_PATTERNS = [
  /\b(kill myself|end my life|commit suicide|going to end it all|want to die tonight|hurt myself right now)\b/i,
];

const SEVERE_ABUSE_OR_SPAM_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(kill you|i will murder|bomb threat|shoot up)\b/i,
    reason: 'Potential threat of violence flagged for human review',
  },
  {
    pattern: /(https?:\/\/\S+){3,}/i,
    reason: 'Multiple external links flagged for spam review',
  },
  {
    pattern: /\b(whatsapp me on|telegram me|crypto investment|guaranteed returns|wire transfer)\b/i,
    reason: 'Potential solicitation or scam pattern flagged for review',
  },
  {
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    reason: 'Possible phone number / personal information exposure flagged for review',
  },
];

/**
 * Safety-conscious screening:
 * - Never auto-bans or auto-removes content on a keyword match.
 * - Never treats ordinary sadness, grief, or difficult emotions as a violation.
 * - Detects imminent self-harm phrasing so the UI can show supportive crisis resources.
 * - Flags clear spam/threats/PII patterns for human moderator review.
 */
export function screenContentForSafety(text: string): SafetyScreeningResult {
  const imminentHarmDetected = IMMINENT_HARM_PATTERNS.some((rx) => rx.test(text));
  const matchedReasons: string[] = [];

  for (const rule of SEVERE_ABUSE_OR_SPAM_PATTERNS) {
    if (rule.pattern.test(text)) {
      matchedReasons.push(rule.reason);
    }
  }

  return {
    requiresModeratorReview: matchedReasons.length > 0,
    flagReason: matchedReasons.length > 0 ? matchedReasons.join('; ') : null,
    imminentHarmDetected,
  };
}

const ADJECTIVES = [
  'Silent',
  'Wandering',
  'Paper',
  'Gentle',
  'Quiet',
  'Amber',
  'Velvet',
  'Distant',
  'Warm',
  'Candid',
  'Still',
  'Evening',
  'Linen',
  'Cedar',
  'Silver',
  'Midnight',
];

const NOUNS = [
  'Cloud',
  'Moon',
  'Ink',
  'Lantern',
  'Harbor',
  'Window',
  'Sparrow',
  'Letter',
  'River',
  'Cedar',
  'Compass',
  'Meadow',
  'Page',
  'Echo',
  'Breeze',
  'Bridge',
];

export function generateAnonymousNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(10 + Math.random() * 89));
  return `${adj}${noun}_${num}`;
}
