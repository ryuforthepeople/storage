import { Hono } from 'hono';
import type { StorageService } from '@for-the-people/storage-core';
import { StorageModuleError } from '@for-the-people/storage-core';
import { parseUpload } from '../middleware/upload.js';

/**
 * Create storage routes
 */
export function storageRoutes(storage: StorageService): Hono {
  const app = new Hono();

  // ─────────────────────────────────────────────────────────────────
  // Capabilities
  // ─────────────────────────────────────────────────────────────────

  app.get('/capabilities', (c) => {
    return c.json(storage.getCapabilities());
  });

  // ─────────────────────────────────────────────────────────────────
  // Bucket operations
  // ─────────────────────────────────────────────────────────────────

  // List buckets
  app.get('/buckets', async (c) => {
    const buckets = await storage.listBuckets();
    return c.json({ buckets });
  });

  // Create bucket
  app.post('/buckets', async (c) => {
    const body = await c.req.json<{ name: string; public?: boolean }>();

    if (!body.name) {
      throw new StorageModuleError('INVALID_REQUEST', 'Bucket name is required', 400);
    }

    const bucket = await storage.createBucket(body.name, {
      public: body.public,
    });

    return c.json(bucket, 201);
  });

  // Get bucket
  app.get('/buckets/:name', async (c) => {
    const name = c.req.param('name');
    const bucket = await storage.getBucket(name);

    if (!bucket) {
      throw new StorageModuleError('BUCKET_NOT_FOUND', `Bucket "${name}" not found`, 404);
    }

    return c.json(bucket);
  });

  // Delete bucket
  app.delete('/buckets/:name', async (c) => {
    const name = c.req.param('name');
    await storage.deleteBucket(name);
    return c.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────────
  // File operations
  // ─────────────────────────────────────────────────────────────────

  // List files in bucket
  app.get('/:bucket', async (c) => {
    const bucket = c.req.param('bucket');
    const prefix = c.req.query('prefix');
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');
    const sortColumn = c.req.query('sort') as 'name' | 'created_at' | 'updated_at' | undefined;
    const sortOrder = c.req.query('order') as 'asc' | 'desc' | undefined;

    const result = await storage.list(bucket, {
      prefix: prefix ?? undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sortBy: sortColumn ? { column: sortColumn, order: sortOrder ?? 'asc' } : undefined,
    });

    return c.json(result);
  });

  // Upload file
  app.post('/:bucket', async (c) => {
    const bucket = c.req.param('bucket');
    const path = c.req.query('path');
    const upsert = c.req.query('upsert') === 'true';
    const cacheControl = c.req.header('cache-control');

    if (!path) {
      throw new StorageModuleError('INVALID_REQUEST', 'Path query parameter is required', 400);
    }

    const upload = await parseUpload(c);
    if (!upload) {
      throw new StorageModuleError('INVALID_REQUEST', 'No file provided', 400);
    }

    const file = await storage.upload(bucket, path, upload.file, {
      contentType: upload.contentType,
      cacheControl: cacheControl ?? undefined,
      upsert,
      metadata: upload.metadata,
    });

    return c.json(file, 201);
  });

  // Download file
  app.get('/:bucket/:path{.+}', async (c) => {
    const bucket = c.req.param('bucket');
    const path = c.req.param('path');

    // Check if this is a signed URL request
    if (c.req.query('url') === 'true') {
      const expiresIn = c.req.query('expiresIn');
      const download = c.req.query('download');

      const signedUrl = await storage.getSignedUrl(bucket, path, {
        expiresIn: expiresIn ? parseInt(expiresIn, 10) : 3600,
        download: download === 'true' ? true : download ?? undefined,
      });

      return c.json({ url: signedUrl });
    }

    // Check if this is a public URL request
    if (c.req.query('public') === 'true') {
      const publicUrl = storage.getPublicUrl(bucket, path);
      return c.json({ url: publicUrl });
    }

    // Get file info request
    if (c.req.query('info') === 'true') {
      const info = await storage.getFileInfo(bucket, path);
      if (!info) {
        throw new StorageModuleError('FILE_NOT_FOUND', `File "${path}" not found`, 404);
      }
      return c.json(info);
    }

    // Download the file
    const blob = await storage.download(bucket, path);
    const info = await storage.getFileInfo(bucket, path);

    return new Response(blob, {
      headers: {
        'Content-Type': info?.mimeType ?? 'application/octet-stream',
        'Content-Length': String(blob.size),
        'Content-Disposition': `attachment; filename="${info?.name ?? path}"`,
      },
    });
  });

  // Delete file
  app.delete('/:bucket/:path{.+}', async (c) => {
    const bucket = c.req.param('bucket');
    const path = c.req.param('path');

    await storage.delete(bucket, path);
    return c.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────────────
  // Move/Copy operations
  // ─────────────────────────────────────────────────────────────────

  // Move file
  app.post('/:bucket/move', async (c) => {
    const bucket = c.req.param('bucket');
    const body = await c.req.json<{ from: string; to: string }>();

    if (!body.from || !body.to) {
      throw new StorageModuleError(
        'INVALID_REQUEST',
        'Both "from" and "to" paths are required',
        400
      );
    }

    const file = await storage.move(bucket, body.from, body.to);
    return c.json(file);
  });

  // Copy file
  app.post('/:bucket/copy', async (c) => {
    const bucket = c.req.param('bucket');
    const body = await c.req.json<{ from: string; to: string }>();

    if (!body.from || !body.to) {
      throw new StorageModuleError(
        'INVALID_REQUEST',
        'Both "from" and "to" paths are required',
        400
      );
    }

    const file = await storage.copy(bucket, body.from, body.to);
    return c.json(file, 201);
  });

  // ─────────────────────────────────────────────────────────────────
  // Signed upload URL
  // ─────────────────────────────────────────────────────────────────

  app.post('/:bucket/upload-url', async (c) => {
    const bucket = c.req.param('bucket');
    const body = await c.req.json<{ path: string; expiresIn?: number }>();

    if (!body.path) {
      throw new StorageModuleError('INVALID_REQUEST', 'Path is required', 400);
    }

    const result = await storage.createSignedUploadUrl(bucket, body.path, {
      expiresIn: body.expiresIn ?? 3600,
    });

    return c.json(result);
  });

  return app;
}
