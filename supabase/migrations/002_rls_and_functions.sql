-- Dear Stranger — Row Level Security Policies & Safe Database Functions
-- Run after 001_initial_schema.sql

-- Helper function: checks whether a user is in admin_users (SECURITY DEFINER avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = uid
  );
$$;

-- Helper function: checks if two users have a block relationship
CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$;

-- Direct-link unlisted letter lookup (excluded from public feeds, safe via direct UUID)
CREATE OR REPLACE FUNCTION public.get_letter_by_direct_link(p_letter_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  category_id UUID,
  visibility TEXT,
  status TEXT,
  allow_external_sharing BOOLEAN,
  language TEXT,
  created_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  author_display_name TEXT,
  is_owner BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.title,
    l.body,
    l.category_id,
    l.visibility,
    l.status,
    l.allow_external_sharing,
    l.language,
    l.created_at,
    l.published_at,
    p.display_name AS author_display_name,
    (auth.uid() IS NOT NULL AND auth.uid() = l.author_id) AS is_owner
  FROM public.letters l
  JOIN public.profiles p ON p.id = l.author_id
  WHERE l.id = p_letter_id
    AND l.deleted_at IS NULL
    AND (
      (l.visibility IN ('public', 'unlisted') AND l.status IN ('published', 'locked'))
      OR (auth.uid() IS NOT NULL AND auth.uid() = l.author_id)
      OR public.is_admin(auth.uid())
    )
    AND (
      auth.uid() IS NULL
      OR NOT public.is_blocked_between(auth.uid(), l.author_id)
    );
$$;

-- Enable RLS on ALL tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- PROFILES POLICIES
-- ---------------------------------------------------------------------------
-- Public/authenticated users can read minimal public profile fields (handled by view/API; row access for active accounts)
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_admin(auth.uid())
    OR (account_status = 'active' AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND account_status = 'active');

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- CATEGORIES POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS categories_select_public ON public.categories;
CREATE POLICY categories_select_public ON public.categories
  FOR SELECT
  USING (is_active = TRUE OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS categories_admin_manage ON public.categories;
CREATE POLICY categories_admin_manage ON public.categories
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- LETTERS POLICIES
-- ---------------------------------------------------------------------------
-- Public discovery ONLY allows public + published/locked + not deleted (never unlisted/private_reserved!)
DROP POLICY IF EXISTS letters_select_public_or_owner ON public.letters;
CREATE POLICY letters_select_public_or_owner ON public.letters
  FOR SELECT
  USING (
    (
      visibility = 'public'
      AND status IN ('published', 'locked')
      AND deleted_at IS NULL
      AND (auth.uid() IS NULL OR NOT public.is_blocked_between(auth.uid(), author_id))
    )
    OR (auth.uid() = author_id AND deleted_at IS NULL)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS letters_insert_authenticated ON public.letters;
CREATE POLICY letters_insert_authenticated ON public.letters
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = author_id
    AND visibility IN ('public', 'unlisted')
    AND status IN ('draft', 'published')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_status = 'active' AND p.age_confirmed_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS letters_update_own ON public.letters;
CREATE POLICY letters_update_own ON public.letters
  FOR UPDATE
  USING (auth.uid() = author_id AND deleted_at IS NULL)
  WITH CHECK (
    auth.uid() = author_id
    AND visibility IN ('public', 'unlisted')
    AND status IN ('draft', 'published')
  );

DROP POLICY IF EXISTS letters_admin_update ON public.letters;
CREATE POLICY letters_admin_update ON public.letters
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- REPLIES POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS replies_select_visible ON public.replies;
CREATE POLICY replies_select_visible ON public.replies
  FOR SELECT
  USING (
    (
      deleted_at IS NULL
      AND status = 'published'
      AND (auth.uid() IS NULL OR NOT public.is_blocked_between(auth.uid(), author_id))
      AND EXISTS (
        SELECT 1 FROM public.letters l
        WHERE l.id = letter_id
          AND l.deleted_at IS NULL
          AND (
            (l.visibility = 'public' AND l.status IN ('published', 'locked'))
            OR l.author_id = auth.uid()
          )
      )
    )
    OR (auth.uid() = author_id AND deleted_at IS NULL)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS replies_insert_authenticated ON public.replies;
CREATE POLICY replies_insert_authenticated ON public.replies
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = author_id
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_status = 'active' AND p.age_confirmed_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS replies_update_own ON public.replies;
CREATE POLICY replies_update_own ON public.replies
  FOR UPDATE
  USING (auth.uid() = author_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- REACTIONS POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reactions_select_public ON public.reactions;
CREATE POLICY reactions_select_public ON public.reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.letters l
      WHERE l.id = letter_id AND l.deleted_at IS NULL AND l.status IN ('published', 'locked')
    )
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS reactions_manage_own ON public.reactions;
CREATE POLICY reactions_manage_own ON public.reactions
  FOR ALL
  USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- SAVED LETTERS POLICIES (Strictly private to owner)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS saved_letters_own ON public.saved_letters;
CREATE POLICY saved_letters_own ON public.saved_letters
  FOR ALL
  USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- ---------------------------------------------------------------------------
-- REPORTS POLICIES (Users can insert their own and see only their own; admins see all)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = reporter_id);

DROP POLICY IF EXISTS reports_select_own_or_admin ON public.reports;
CREATE POLICY reports_select_own_or_admin ON public.reports
  FOR SELECT
  USING (auth.uid() = reporter_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS reports_admin_update ON public.reports;
CREATE POLICY reports_admin_update ON public.reports
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- BLOCKS POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS blocks_manage_own ON public.blocks;
CREATE POLICY blocks_manage_own ON public.blocks
  FOR ALL
  USING (auth.role() = 'authenticated' AND auth.uid() = blocker_id)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = blocker_id AND blocker_id <> blocked_id);

-- ---------------------------------------------------------------------------
-- MODERATION ACTIONS, ADMIN_USERS, EMAIL LOGS (Admin / Service-role only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS moderation_actions_admin_only ON public.moderation_actions;
CREATE POLICY moderation_actions_admin_only ON public.moderation_actions
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- No user can modify admin_users via RLS! Only read own row or super_admin read.
DROP POLICY IF EXISTS admin_users_select_restricted ON public.admin_users;
CREATE POLICY admin_users_select_restricted ON public.admin_users
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS email_delivery_logs_admin_only ON public.email_delivery_logs;
CREATE POLICY email_delivery_logs_admin_only ON public.email_delivery_logs
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- USER NOTIFICATION PREFERENCES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_prefs_own ON public.user_notification_preferences;
CREATE POLICY notification_prefs_own ON public.user_notification_preferences
  FOR ALL
  USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- PLATFORM SETTINGS & ANALYTICS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_settings_select_public ON public.platform_settings;
CREATE POLICY platform_settings_select_public ON public.platform_settings
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS platform_settings_admin_write ON public.platform_settings;
CREATE POLICY platform_settings_admin_write ON public.platform_settings
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS analytics_events_admin_read ON public.analytics_events;
CREATE POLICY analytics_events_admin_read ON public.analytics_events
  FOR SELECT
  USING (public.is_admin(auth.uid()));
