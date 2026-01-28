import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { StorageAdapter, SupabaseStorageConfig } from '@for-the-people/storage-core';
import {
  StorageService,
  SupabaseStorageAdapter,
  InMemoryStorageAdapter,
  StorageModuleError,
} from '@for-the-people/storage-core';
import { storageRoutes } from './routes/storage.js';

export interface AppConfig {
  /** Pre-configured storage adapter */
  adapter?: StorageAdapter;
  /** Supabase config (if not providing adapter) */
  supabase?: SupabaseStorageConfig;
  /** Use in-memory adapter for testing */
  useMemory?: boolean;
  /** CORS origins */
  corsOrigins?: string[];
}

/**
 * Create the storage API Hono app
 */
export function createApp(config: AppConfig): Hono {
  const app = new Hono();

  // Determine which adapter to use
  let adapter: StorageAdapter;
  if (config.adapter) {
    adapter = config.adapter;
  } else if (config.supabase) {
    adapter = new SupabaseStorageAdapter(config.supabase);
  } else if (config.useMemory) {
    adapter = new InMemoryStorageAdapter();
  } else {
    throw new Error('Must provide adapter, supabase config, or useMemory: true');
  }

  const storageService = new StorageService(adapter);

  // CORS middleware
  app.use(
    '*',
    cors({
      origin: config.corsOrigins ?? ['*'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Filename', 'X-Metadata', 'Cache-Control'],
      exposeHeaders: ['Content-Length', 'Content-Type', 'Content-Disposition'],
      credentials: true,
    })
  );

  // Error handling
  app.onError((err, c) => {
    if (err instanceof StorageModuleError) {
      return c.json(err.toJSON(), err.status as 400 | 404 | 413 | 415 | 500);
    }

    console.error('Unexpected error:', err);
    return c.json(
      {
        code: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
        status: 500,
      },
      500
    );
  });

  // Health check
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      provider: storageService.provider,
      timestamp: new Date().toISOString(),
    })
  );

  // Mount routes
  app.route('/api/v1/storage', storageRoutes(storageService));

  return app;
}

// Re-export for convenience
export { storageRoutes } from './routes/storage.js';
export { parseUpload, maxFileSize, allowedContentTypes } from './middleware/upload.js';
