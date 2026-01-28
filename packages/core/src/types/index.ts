export * from './capabilities.js';

// ─────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────

export interface Bucket {
  id: string;
  name: string;
  public: boolean;
  createdAt: string;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
}

export interface FileRecord {
  id: string;
  name: string;
  bucket: string;
  path: string;
  size: number;
  mimeType: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────
// Options Types
// ─────────────────────────────────────────────────────────────────

export interface UploadOptions {
  /** Content type override */
  contentType?: string;
  /** Cache control header */
  cacheControl?: string;
  /** Overwrite if exists */
  upsert?: boolean;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

export interface ListOptions {
  /** Filter by path prefix */
  prefix?: string;
  /** Maximum items to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort configuration */
  sortBy?: {
    column: 'name' | 'created_at' | 'updated_at';
    order: 'asc' | 'desc';
  };
}

export interface SignedUrlOptions {
  /** Expiration time in seconds */
  expiresIn: number;
  /** Force download, optionally with custom filename */
  download?: boolean | string;
  /** Image transformation options */
  transform?: ImageTransform;
}

export interface ImageTransform {
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Resize mode */
  resize?: 'cover' | 'contain' | 'fill';
  /** Quality (1-100) */
  quality?: number;
  /** Output format */
  format?: 'webp' | 'png' | 'jpeg';
}

// ─────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────

export interface StorageErrorData {
  code: string;
  message: string;
  status: number;
}

export class StorageModuleError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number = 500) {
    super(message);
    this.name = 'StorageModuleError';
    this.code = code;
    this.status = status;
  }

  toJSON(): StorageErrorData {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Config Types
// ─────────────────────────────────────────────────────────────────

export interface SupabaseStorageConfig {
  /** Supabase project URL */
  url: string;
  /** Supabase anon/service key */
  key: string;
  /** Optional service role key for admin operations */
  serviceKey?: string;
}
