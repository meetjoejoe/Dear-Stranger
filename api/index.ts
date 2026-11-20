import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../server/app.ts';

let cachedAppPromise: Promise<Awaited<ReturnType<typeof createApiApp>>> | null = null;

function getApp() {
  if (!cachedAppPromise) {
    cachedAppPromise = createApiApp().catch((err) => {
      cachedAppPromise = null;
      throw err;
    });
  }
  return cachedAppPromise;
}

export function normalizeVercelApiUrl(rawUrl: string | undefined): string {
  const url = new URL(rawUrl || '/api', 'http://localhost');
  const vercelPath = url.searchParams.get('__vercel_path');
  if (vercelPath !== null) {
    url.searchParams.delete('__vercel_path');
    const cleaned = vercelPath.replace(/^\/+/, '');
    const qs = url.searchParams.toString();
    return `/api${cleaned ? `/${cleaned}` : ''}${qs ? `?${qs}` : ''}`;
  }
  return `${url.pathname}${url.search}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = normalizeVercelApiUrl(req.url);
  const app = await getApp();
  return app(req, res);
}
