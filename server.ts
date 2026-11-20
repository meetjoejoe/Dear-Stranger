import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiApp } from './server/app.ts';
import { getServerConfig, isSupabaseConfigured } from './server/config.ts';
import { injectLetterOpenGraph } from './server/ogMeta.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp(options?: { skipVite?: boolean }) {
  const app = await createApiApp();
  const cfg = getServerConfig();

  // -------------------------------------------------------------------------
  // FRONTEND SERVING (Vite dev middleware or built dist/) + Dynamic OG tags
  // -------------------------------------------------------------------------
  if (!options?.skipVite) {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexPath = path.resolve(distPath, 'index.html');
    const hasDistBuild = fs.existsSync(distIndexPath);
    const shouldServeDist =
      cfg.nodeEnv === 'production' ||
      Boolean(process.env.K_SERVICE) ||
      (hasDistBuild && process.env.NODE_ENV !== 'development');

    if (!shouldServeDist) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);

      app.use('*', async (req, res, next) => {
        try {
          const url = req.originalUrl;
          let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          const letterMatch = url.match(/^\/letters\/([a-f0-9-]{8,64})/i);
          if (letterMatch) {
            const origin = cfg.appUrl || `${req.protocol}://${req.get('host')}`;
            template = await injectLetterOpenGraph(template, letterMatch[1], `${origin}${url}`);
          }
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (err) {
          vite.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    } else {
      app.use(express.static(distPath, { index: false }));

      app.use('*', async (req, res, next) => {
        try {
          let template = fs.readFileSync(distIndexPath, 'utf-8');
          const letterMatch = req.originalUrl.match(/^\/letters\/([a-f0-9-]{8,64})/i);
          if (letterMatch) {
            const origin = cfg.appUrl || `${req.protocol}://${req.get('host')}`;
            template = await injectLetterOpenGraph(template, letterMatch[1], `${origin}${req.originalUrl}`);
          }
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (err) {
          next(err);
        }
      });
    }
  }

  return app;
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(path.resolve(process.argv[1])) ===
      fs.realpathSync(path.resolve(fileURLToPath(import.meta.url)))
    );
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  }
})();

if (isMainModule) {
  const cfg = getServerConfig();
  createApp().then((app) => {
    app.listen(cfg.port, '0.0.0.0', () => {
      console.log(
        `Dear Stranger server listening on port ${cfg.port} (Supabase: ${
          isSupabaseConfigured() ? 'connected' : 'setup/sandbox'
        })`
      );
    });
  });
}
