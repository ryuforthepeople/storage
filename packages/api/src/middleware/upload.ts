import type { Context, Next } from 'hono';
import { StorageModuleError } from '@for-the-people/storage-core';

/**
 * Parse multipart form data and extract file information
 */
export interface ParsedUpload {
  file: File;
  filename: string;
  contentType: string;
  metadata?: Record<string, string>;
}

/**
 * Middleware to parse multipart uploads
 */
export async function parseUpload(c: Context): Promise<ParsedUpload | null> {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return null;
    }

    // Parse optional metadata from form
    const metadataStr = formData.get('metadata');
    let metadata: Record<string, string> | undefined;

    if (metadataStr && typeof metadataStr === 'string') {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        // Ignore invalid JSON
      }
    }

    return {
      file,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      metadata,
    };
  }

  // Handle raw binary upload
  if (
    contentType.includes('application/octet-stream') ||
    contentType.includes('image/') ||
    contentType.includes('video/') ||
    contentType.includes('audio/')
  ) {
    const buffer = await c.req.arrayBuffer();
    const filename = c.req.header('x-filename') ?? 'upload';

    const file = new File([buffer], filename, { type: contentType });

    // Parse metadata from header
    const metadataHeader = c.req.header('x-metadata');
    let metadata: Record<string, string> | undefined;

    if (metadataHeader) {
      try {
        metadata = JSON.parse(metadataHeader);
      } catch {
        // Ignore invalid JSON
      }
    }

    return {
      file,
      filename,
      contentType,
      metadata,
    };
  }

  return null;
}

/**
 * Middleware to validate max file size
 */
export function maxFileSize(maxBytes: number) {
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxBytes) {
        throw new StorageModuleError(
          'FILE_TOO_LARGE',
          `File size ${size} exceeds maximum ${maxBytes} bytes`,
          413
        );
      }
    }

    await next();
  };
}

/**
 * Middleware to validate content types
 */
export function allowedContentTypes(types: string[] | '*') {
  return async (c: Context, next: Next) => {
    if (types === '*') {
      await next();
      return;
    }

    const contentType = c.req.header('content-type');
    if (!contentType) {
      await next();
      return;
    }

    // Extract the base type without parameters
    const baseType = contentType.split(';')[0]?.trim() ?? '';

    // Check for multipart (always allowed for uploads)
    if (baseType === 'multipart/form-data') {
      await next();
      return;
    }

    if (!types.includes(baseType)) {
      throw new StorageModuleError(
        'CONTENT_TYPE_NOT_ALLOWED',
        `Content type "${baseType}" is not allowed`,
        415
      );
    }

    await next();
  };
}
