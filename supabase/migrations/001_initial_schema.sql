-- Dear Stranger — Initial Database Schema Migration
-- Compatible with Supabase PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL UNIQUE,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'restricted', 'suspended', 'deleted')),
  preferred_theme TEXT NOT NULL DEFAULT 'light'
    CHECK (preferred_theme IN ('light', 'dark')),
  preferred_language TEXT NOT NULL DEFAULT 'en',
  age_confirmed_at TIMESTAMPTZ,
  avatar_identifier TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  recovery_email_linked BOOLEAN NOT NULL DEFAULT FALSE,
  restriction_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT display_name_length CHECK (char_length(display_name) BETWEEN 3 AND 40)
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(account_status);

-- ---------------------------------------------------------------------------
-- 2. CATEGORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON public.categories(is_active, sort_order);

-- Seed initial 8 categories
INSERT INTO public.categories (name, slug, description, is_active, sort_order)
VALUES
  ('Life', 'life', 'Everyday reflections, turning points, and quiet observations.', TRUE, 1),
  ('Relationships', 'relationships', 'Love, friendship, heartbreak, boundaries, and human connection.', TRUE, 2),
  ('Family', 'family', 'Parents, siblings, heritage, duty, and domestic life.', TRUE, 3),
  ('School & Career', 'school-and-career', 'Ambition, burnout, uncertainty, studying, and work.', TRUE, 4),
  ('Personal Growth', 'personal-growth', 'Becoming yourself, letting go, habits, and inner change.', TRUE, 5),
  ('Confessions', 'confessions', 'Truths rarely spoken aloud, regrets, and unburdened secrets.', TRUE, 6),
  ('Questions', 'questions', 'Honest questions for strangers with different life experiences.', TRUE, 7),
  ('Random Thoughts', 'random-thoughts', 'Late-night ponderings, fragments, and passing wonder.', TRUE, 8)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. LETTERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id),
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private_reserved')),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'flagged_for_review', 'removed', 'locked')),
  allow_external_sharing BOOLEAN NOT NULL DEFAULT TRUE,
  is_flagged_safety BOOLEAN NOT NULL DEFAULT FALSE,
  safety_flag_reason TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(body, '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT letter_title_length CHECK (title IS NULL OR char_length(title) <= 160),
  CONSTRAINT letter_body_length CHECK (
    (status = 'draft' AND char_length(body) <= 10000) OR
    (status <> 'draft' AND char_length(body) BETWEEN 20 AND 10000)
  )
);

CREATE INDEX IF NOT EXISTS idx_letters_public_feed
  ON public.letters(published_at DESC NULLS LAST)
  WHERE visibility = 'public' AND status IN ('published', 'locked') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_letters_category
  ON public.letters(category_id, published_at DESC)
  WHERE visibility = 'public' AND status IN ('published', 'locked') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_letters_author
  ON public.letters(author_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_letters_search_vector
  ON public.letters USING GIN(search_vector);

-- ---------------------------------------------------------------------------
-- 4. REPLIES (strictly 1-level nesting enforced via trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES public.letters(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES public.replies(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'flagged_for_review', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT reply_body_length CHECK (char_length(body) BETWEEN 2 AND 3000)
);

CREATE INDEX IF NOT EXISTS idx_replies_letter_created
  ON public.replies(letter_id, created_at ASC)
  WHERE deleted_at IS NULL AND status <> 'removed';

CREATE INDEX IF NOT EXISTS idx_replies_author
  ON public.replies(author_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_one_level_reply_nesting()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_parent UUID;
  v_parent_letter UUID;
  v_letter_status TEXT;
BEGIN
  SELECT status INTO v_letter_status
  FROM public.letters
  WHERE id = NEW.letter_id AND deleted_at IS NULL;

  IF v_letter_status IS NULL OR v_letter_status IN ('removed', 'locked', 'draft') THEN
    RAISE EXCEPTION 'Cannot reply to a deleted, locked, or unpublished letter.';
  END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT parent_reply_id, letter_id INTO v_parent_parent, v_parent_letter
    FROM public.replies
    WHERE id = NEW.parent_reply_id AND deleted_at IS NULL;

    IF v_parent_letter IS NULL THEN
      RAISE EXCEPTION 'Parent reply does not exist.';
    END IF;

    IF v_parent_letter <> NEW.letter_id THEN
      RAISE EXCEPTION 'Parent reply belongs to a different letter.';
    END IF;

    IF v_parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'Only one nested response level is permitted.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reply_rules ON public.replies;
CREATE TRIGGER trg_enforce_reply_rules
  BEFORE INSERT ON public.replies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_one_level_reply_nesting();

-- ---------------------------------------------------------------------------
-- 5. REACTIONS (1 active reaction per user per letter, changeable/removable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES public.letters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL
    CHECK (reaction_type IN (
      'i_hear_you',
      'sending_strength',
      'i_understand',
      'made_me_smile',
      'thank_you'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_reaction_letter_user UNIQUE (letter_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_letter ON public.reactions(letter_id);

-- ---------------------------------------------------------------------------
-- 6. SAVED LETTERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  letter_id UUID NOT NULL REFERENCES public.letters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_saved_letter_user UNIQUE (user_id, letter_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_letters_user ON public.saved_letters(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL
    CHECK (notification_type IN (
      'reply_to_letter',
      'response_to_reply',
      'security_event',
      'moderation_decision'
    )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_letter_id UUID REFERENCES public.letters(id) ON DELETE SET NULL,
  related_reply_id UUID REFERENCES public.replies(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(recipient_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. REPORTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('letter', 'reply', 'account')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'harassment',
    'threats',
    'hate_abuse',
    'spam_scams',
    'sexual_exploitation',
    'personal_info',
    'self_harm',
    'other'
  )),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed_action_taken', 'dismissed', 'appealed')),
  appeal_note TEXT,
  appealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. BLOCKS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id),
  CONSTRAINT uq_block_pair UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);

-- ---------------------------------------------------------------------------
-- 10. MODERATION ACTIONS & ADMIN USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES public.profiles(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('letter', 'reply', 'account', 'report')),
  target_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_created ON public.moderation_actions(created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. NOTIFICATION PREFERENCES & EMAIL DELIVERY LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reply_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  conversation_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 12. PLATFORM SETTINGS & PRIVACY-SAFE AGGREGATE ANALYTICS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.platform_settings (key, value)
VALUES
  ('letter_of_the_day', '{"letter_id": null, "editor_note": null}'::jsonb),
  ('platform_announcement', '{"active": false, "message": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'letter_submitted',
    'reply_submitted',
    'letter_shared',
    'letter_opened',
    'reaction_submitted',
    'first_reply_received',
    'return_participation'
  )),
  category_slug TEXT,
  letter_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type_created
  ON public.analytics_events(event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 13. UPDATED_AT TRIGGER HELPER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_letters_updated_at ON public.letters;
CREATE TRIGGER trg_letters_updated_at
  BEFORE UPDATE ON public.letters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_replies_updated_at ON public.replies;
CREATE TRIGGER trg_replies_updated_at
  BEFORE UPDATE ON public.replies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
