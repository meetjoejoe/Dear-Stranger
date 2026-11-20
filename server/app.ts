import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { getServerConfig, isSupabaseConfigured } from './config.ts';
import {
  AppError,
  blockAuthorByLetterOrReply,
  checkSupabaseSchemaReady,
  createLetter,
  createOrUpdateCategory,
  createReply,
  createReport,
  createSandboxSession,
  deleteAccountAndData,
  deleteOwnLetter,
  deleteOwnReply,
  executeModerationDecision,
  getDashboardData,
  getLetterDetail,
  getLetterOfTheDay,
  getModerationConsoleData,
  getOpenLetterbox,
  getPlatformAnnouncement,
  getSurpriseLetter,
  listCategories,
  listPublicLetters,
  markNotificationsRead,
  recordShareEvent,
  removeBlock,
  resolveAuthContext,
  setLetterOfTheDay,
  setLetterReaction,
  setPlatformAnnouncement,
  setSandboxAdminMode,
  submitModerationAppeal,
  toggleSavedLetter,
  updateNotificationPreferences,
  updateOwnLetter,
  updateOwnReply,
  updateProfileSettings,
  type AuthContext,
} from './dataService.ts';
import { checkAndMarkDuplicate, checkRateLimit, hashRequestActor } from './rateLimit.ts';
import { sandboxStore } from './sandboxStore.ts';
import { reactionInputSchema } from '../src/shared/validation.ts';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function enforceRateLimit(
  req: Request,
  userId: string | null,
  scope: string,
  maxRequests: number,
  windowMs: number
): void {
  const actorKey = hashRequestActor(req, userId);
  const result = checkRateLimit(scope, actorKey, maxRequests, windowMs);
  if (!result.allowed) {
    throw new AppError(429, `Too many requests. Please wait ${result.retryAfterSec} seconds and try again.`);
  }
}

export async function createApiApp() {
  const app = express();
  const cfg = getServerConfig();

  app.set('trust proxy', 1);

  // HTTP security headers (iframe-compatible)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.use((_, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Skip express.json() if a serverless platform (e.g. Vercel) already parsed req.body
  const jsonMiddleware = express.json({ limit: '256kb' });
  app.use((req, res, next) => {
    if (req.body !== undefined || req.readableEnded) {
      next();
      return;
    }
    jsonMiddleware(req, res, next);
  });

  // Attach auth context if Bearer token is present
  const attachAuth = async (req: Request): Promise<AuthContext | null> => {
    const token = extractBearerToken(req);
    if (!token) return null;
    return resolveAuthContext(token);
  };

  // -------------------------------------------------------------------------
  // HEALTH & PUBLIC CONFIG
  // -------------------------------------------------------------------------
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const supabaseConfigured = isSupabaseConfigured();
      const supabaseSchemaReady = supabaseConfigured ? await checkSupabaseSchemaReady() : false;
      res.json({
        status: 'ok',
        service: 'dear-stranger',
        supabaseConfigured,
        supabaseSchemaReady,
        timestamp: new Date().toISOString(),
      });
    })
  );

  app.get(
    '/api/config',
    asyncHandler(async (_req, res) => {
      const supabaseConfigured = isSupabaseConfigured();
      const [announcement, supabaseSchemaReady] = await Promise.all([
        getPlatformAnnouncement(),
        supabaseConfigured ? checkSupabaseSchemaReady() : Promise.resolve(false),
      ]);
      res.json({
        supabaseConfigured,
        supabaseSchemaReady,
        supabaseUrl: cfg.supabaseUrl,
        supabasePublishableKey: cfg.supabasePublishableKey,
        turnstileSiteKey: cfg.turnstileSiteKey,
        emailConfigured: Boolean(cfg.resendApiKey),
        sandboxActive: !supabaseConfigured,
        sandboxHasSamples: !supabaseConfigured && sandboxStore.samplesLoaded,
        platformAnnouncement: announcement,
      });
    })
  );

  // -------------------------------------------------------------------------
  // SANDBOX PREVIEW CONTROLS (Disabled when Supabase is connected)
  // -------------------------------------------------------------------------
  app.post(
    '/api/sandbox/session',
    asyncHandler(async (req, res) => {
      if (isSupabaseConfigured()) {
        throw new AppError(403, 'Sandbox auth is disabled when Supabase is configured.');
      }
      enforceRateLimit(req, null, 'anon_signup', 20, 60 * 60 * 1000);
      const session = createSandboxSession(Boolean(req.body?.asAdmin));
      res.status(201).json(session);
    })
  );

  app.post(
    '/api/sandbox/samples',
    asyncHandler(async (_req, res) => {
      if (isSupabaseConfigured()) {
        throw new AppError(403, 'Sandbox samples are disabled when Supabase is configured.');
      }
      sandboxStore.loadSamples();
      res.json({ samplesLoaded: true });
    })
  );

  app.post(
    '/api/sandbox/reset',
    asyncHandler(async (_req, res) => {
      if (isSupabaseConfigured()) {
        throw new AppError(403, 'Sandbox reset is disabled when Supabase is configured.');
      }
      sandboxStore.reset();
      res.json({ reset: true });
    })
  );

  app.post(
    '/api/sandbox/toggle-admin',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required.');
      const profile = setSandboxAdminMode(auth, Boolean(req.body?.enabled));
      res.json({ profile });
    })
  );

  // -------------------------------------------------------------------------
  // AUTH / PROFILE
  // -------------------------------------------------------------------------
  app.get(
    '/api/me',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) {
        res.json({ profile: null });
        return;
      }
      res.json({ profile: auth.profile });
    })
  );

  app.patch(
    '/api/me',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Authentication required.');
      const profile = await updateProfileSettings(auth, {
        displayName: req.body?.displayName,
        preferredTheme: req.body?.preferredTheme,
        confirmAge18Plus: req.body?.confirmAge18Plus,
        recoveryEmail: req.body?.recoveryEmail,
      });
      res.json({ profile });
    })
  );

  app.delete(
    '/api/me',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Authentication required.');
      await deleteAccountAndData(auth);
      res.json({ deleted: true });
    })
  );

  // -------------------------------------------------------------------------
  // CATEGORIES & DISCOVERY
  // -------------------------------------------------------------------------
  app.get(
    '/api/categories',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const includeInactive = Boolean(req.query.all === 'true' && auth?.profile.isAdmin);
      const categories = await listCategories(includeInactive);
      res.json({ categories });
    })
  );

  app.get(
    '/api/letters',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const categorySlug = typeof req.query.category === 'string' ? req.query.category : undefined;
      const query = typeof req.query.q === 'string' ? req.query.q : undefined;
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 12);
      const result = await listPublicLetters({
        viewerId: auth?.userId || null,
        categorySlug,
        query,
        page,
        limit,
      });
      res.json(result);
    })
  );

  app.get(
    '/api/letters/surprise',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const excludeParam = typeof req.query.exclude === 'string' ? req.query.exclude : '';
      const excludeIds = excludeParam.split(',').filter(Boolean);
      const letter = await getSurpriseLetter(auth?.userId || null, excludeIds);
      res.json({ letter });
    })
  );

  app.get(
    '/api/letters/open-letterbox',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const letters = await getOpenLetterbox(auth?.userId || null);
      res.json({ letters });
    })
  );

  app.get(
    '/api/letters/letter-of-the-day',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const result = await getLetterOfTheDay(auth?.userId || null);
      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // LETTER DETAIL & CRUD
  // -------------------------------------------------------------------------
  app.get(
    '/api/letters/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const recordOpen = req.query.track !== 'false';
      const detail = await getLetterDetail(req.params.id, auth, recordOpen);
      res.json(detail);
    })
  );

  app.post(
    '/api/letters',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      enforceRateLimit(req, auth?.userId || null, 'create_letter', 10, 60 * 60 * 1000);

      const actorKey = hashRequestActor(req, auth?.userId);
      if (req.body?.status !== 'draft' && typeof req.body?.body === 'string') {
        if (checkAndMarkDuplicate(actorKey, 'create_letter', req.body.body)) {
          throw new AppError(409, 'This letter was already submitted moments ago.');
        }
      }

      const result = await createLetter(auth, req.body);
      res.status(201).json(result);
    })
  );

  app.patch(
    '/api/letters/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      enforceRateLimit(req, auth?.userId || null, 'update_letter', 20, 60 * 60 * 1000);
      const letter = await updateOwnLetter(auth, req.params.id, req.body);
      res.json({ letter });
    })
  );

  app.delete(
    '/api/letters/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await deleteOwnLetter(auth, req.params.id);
      res.json({ deleted: true });
    })
  );

  app.post(
    '/api/letters/:id/share-event',
    asyncHandler(async (req, res) => {
      await recordShareEvent(req.params.id);
      res.json({ recorded: true });
    })
  );

  // -------------------------------------------------------------------------
  // REPLIES
  // -------------------------------------------------------------------------
  app.post(
    '/api/letters/:id/replies',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      enforceRateLimit(req, auth?.userId || null, 'create_reply', 30, 60 * 60 * 1000);

      const actorKey = hashRequestActor(req, auth?.userId);
      if (typeof req.body?.body === 'string') {
        if (checkAndMarkDuplicate(actorKey, `reply:${req.params.id}`, req.body.body)) {
          throw new AppError(409, 'This reply was already submitted moments ago.');
        }
      }

      const result = await createReply(auth, req.params.id, req.body);
      res.status(201).json(result);
    })
  );

  app.patch(
    '/api/replies/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const reply = await updateOwnReply(auth, req.params.id, String(req.body?.body || ''));
      res.json({ reply });
    })
  );

  app.delete(
    '/api/replies/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await deleteOwnReply(auth, req.params.id);
      res.json({ deleted: true });
    })
  );

  // -------------------------------------------------------------------------
  // REACTIONS & SAVES
  // -------------------------------------------------------------------------
  app.put(
    '/api/letters/:id/reaction',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      enforceRateLimit(req, auth?.userId || null, 'reaction', 60, 10 * 60 * 1000);
      const parsed = reactionInputSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'Invalid reaction type.');
      const reactions = await setLetterReaction(auth, req.params.id, parsed.data.reactionType);
      res.json({ reactions });
    })
  );

  app.put(
    '/api/letters/:id/save',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const result = await toggleSavedLetter(auth, req.params.id, Boolean(req.body?.save));
      res.json(result);
    })
  );

  // -------------------------------------------------------------------------
  // PERSONAL DASHBOARD, NOTIFICATIONS, PREFERENCES, BLOCKS, REPORTS
  // -------------------------------------------------------------------------
  app.get(
    '/api/dashboard',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required to access your personal dashboard.');
      const data = await getDashboardData(auth);
      res.json(data);
    })
  );

  app.post(
    '/api/notifications/read',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required.');
      await markNotificationsRead(auth, req.body?.notificationId);
      res.json({ ok: true });
    })
  );

  app.put(
    '/api/preferences/notifications',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required.');
      const preferences = await updateNotificationPreferences(auth, req.body || {});
      res.json({ preferences });
    })
  );

  app.post(
    '/api/reports',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      enforceRateLimit(req, auth?.userId || null, 'report', 15, 60 * 60 * 1000);
      await createReport(auth, req.body);
      res.status(201).json({ submitted: true });
    })
  );

  app.post(
    '/api/blocks',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await blockAuthorByLetterOrReply(auth, {
        letterId: req.body?.letterId,
        replyId: req.body?.replyId,
      });
      res.status(201).json({ blocked: true });
    })
  );

  app.delete(
    '/api/blocks/:id',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required.');
      await removeBlock(auth, req.params.id);
      res.json({ unblocked: true });
    })
  );

  app.post(
    '/api/appeals',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      if (!auth) throw new AppError(401, 'Sign in required.');
      await submitModerationAppeal(auth, String(req.body?.note || ''));
      res.status(201).json({ submitted: true });
    })
  );

  // -------------------------------------------------------------------------
  // ADMIN & MODERATION ROUTES (Server-verified admin only)
  // -------------------------------------------------------------------------
  app.get(
    '/api/admin/moderation',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const data = await getModerationConsoleData(auth);
      res.json(data);
    })
  );

  app.post(
    '/api/admin/moderation/decision',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await executeModerationDecision(auth, req.body);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/categories',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      const category = await createOrUpdateCategory(auth, req.body);
      res.json({ category });
    })
  );

  app.put(
    '/api/admin/letter-of-the-day',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await setLetterOfTheDay(auth, req.body?.letterId || null, req.body?.editorNote || null);
      res.json({ ok: true });
    })
  );

  app.put(
    '/api/admin/announcement',
    asyncHandler(async (req, res) => {
      const auth = await attachAuth(req);
      await setPlatformAnnouncement(auth, Boolean(req.body?.active), String(req.body?.message || ''));
      res.json({ ok: true });
    })
  );

  // Unknown API routes -> 404 JSON
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Central API Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[server error]', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}
