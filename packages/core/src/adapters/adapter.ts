import type {
  StorageCapabilities,
  Bucket,
  FileRecord,
  UploadOptions,
  ListOptions,
  SignedUrlOptions,
  ImageTransform,
} from '../types/index.js';

/**
 * StorageAdapter interface - all storage providers must implement this
 */
export interface StorageAdapter {
  /** Provider identifier (e.g., 'supabase', 's3', 'cloudflare') */
  readonly provider: string;

  /**
   * Get adapter capabilities
   * Used by apps to know what features are available
   */
  getCapabilities(): StorageCapabilities;

  // ─────────────────────────────────────────────────────────────────
  // Bucket operations
  // ─────────────────────────────────────────────────────────────────

  /** Create a new bucket */
  createBucket(name: string, options?: { public?: boolean }): Promise<Bucket>;

  /** Get bucket by name */
  getBucket(name: string): Promise<Bucket | null>;

  /** List all buckets */
  listBuckets(): Promise<Bucket[]>;

  /** Delete a bucket (must be empty) */
  deleteBucket(name: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────
  // File operations
  // ─────────────────────────────────────────────────────────────────

  /** Upload a file */
  upload(
    bucket: string,
    path: string,
    file: File | Blob | Buffer | ArrayBuffer,
    options?: UploadOptions
  ): Promise<FileRecord>;

  /** Download a file */
  download(bucket: string, path: string): Promise<Blob>;

  /** Get file info/metadata */
  getFileInfo(bucket: string, path: string): Promise<FileRecord | null>;

  /** List files in a bucket */
  list(
    bucket: string,
    options?: ListOptions
  ): Promise<{ files: FileRecord[]; hasMore: boolean }>;

  /** Delete files */
  delete(bucket: string, paths: string[]): Promise<void>;

  /** Move/rename a file */
  move(bucket: string, fromPath: string, toPath: string): Promise<FileRecord>;

  /** Copy a file */
  copy(bucket: string, fromPath: string, toPath: string): Promise<FileRecord>;

  // ─────────────────────────────────────────────────────────────────
  // URL operations
  // ─────────────────────────────────────────────────────────────────

  /** Get public URL for a file (bucket must be public) */
  getPublicUrl(
    bucket: string,
    path: string,
    options?: { transform?: ImageTransform }
  ): string;

  /** Get signed URL for a file (works for private buckets) */
  getSignedUrl(
    bucket: string,
    path: string,
    options: SignedUrlOptions
  ): Promise<string>;

  // ─────────────────────────────────────────────────────────────────
  // Advanced operations (optional)
  // ─────────────────────────────────────────────────────────────────

  /** Create a signed URL for uploading */
  createSignedUploadUrl?(
    bucket: string,
    path: string,
    options?: { expiresIn: number }
  ): Promise<{ url: string; token: string }>;
}
