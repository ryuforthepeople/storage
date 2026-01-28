import type { StorageAdapter } from '../adapters/adapter.js';
import type {
  StorageCapabilities,
  Bucket,
  FileRecord,
  UploadOptions,
  ListOptions,
  SignedUrlOptions,
  ImageTransform,
} from '../types/index.js';
import { StorageModuleError } from '../types/index.js';

/**
 * StorageService - orchestrates storage operations through adapters
 *
 * Provides a consistent interface regardless of the underlying provider,
 * with capability checking and validation.
 */
export class StorageService {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /** Get the provider name */
  get provider(): string {
    return this.adapter.provider;
  }

  /** Get adapter capabilities */
  getCapabilities(): StorageCapabilities {
    return this.adapter.getCapabilities();
  }

  // ─────────────────────────────────────────────────────────────────
  // Bucket operations
  // ─────────────────────────────────────────────────────────────────

  async createBucket(
    name: string,
    options?: { public?: boolean }
  ): Promise<Bucket> {
    const caps = this.getCapabilities();

    // Validate public bucket support
    if (options?.public && !caps.buckets.public) {
      throw new StorageModuleError(
        'PUBLIC_BUCKETS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support public buckets`,
        400
      );
    }

    // Validate private bucket support
    if (!options?.public && !caps.buckets.private) {
      throw new StorageModuleError(
        'PRIVATE_BUCKETS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support private buckets`,
        400
      );
    }

    return this.adapter.createBucket(name, options);
  }

  async getBucket(name: string): Promise<Bucket | null> {
    return this.adapter.getBucket(name);
  }

  async listBuckets(): Promise<Bucket[]> {
    return this.adapter.listBuckets();
  }

  async deleteBucket(name: string): Promise<void> {
    return this.adapter.deleteBucket(name);
  }

  // ─────────────────────────────────────────────────────────────────
  // File operations
  // ─────────────────────────────────────────────────────────────────

  async upload(
    bucket: string,
    path: string,
    file: File | Blob | Buffer | ArrayBuffer,
    options?: UploadOptions
  ): Promise<FileRecord> {
    const caps = this.getCapabilities();

    // Validate file size
    let fileSize: number;
    if (Buffer.isBuffer(file)) {
      fileSize = file.length;
    } else if (file instanceof ArrayBuffer) {
      fileSize = file.byteLength;
    } else {
      fileSize = file.size;
    }

    if (fileSize > caps.files.maxSizeBytes) {
      throw new StorageModuleError(
        'FILE_TOO_LARGE',
        `File size ${fileSize} exceeds maximum ${caps.files.maxSizeBytes} bytes`,
        413
      );
    }

    // Validate MIME type
    if (caps.files.allowedMimeTypes !== '*' && options?.contentType) {
      if (!caps.files.allowedMimeTypes.includes(options.contentType)) {
        throw new StorageModuleError(
          'MIME_TYPE_NOT_ALLOWED',
          `MIME type "${options.contentType}" is not allowed`,
          400
        );
      }
    }

    return this.adapter.upload(bucket, path, file, options);
  }

  async download(bucket: string, path: string): Promise<Blob> {
    return this.adapter.download(bucket, path);
  }

  async getFileInfo(bucket: string, path: string): Promise<FileRecord | null> {
    return this.adapter.getFileInfo(bucket, path);
  }

  async list(
    bucket: string,
    options?: ListOptions
  ): Promise<{ files: FileRecord[]; hasMore: boolean }> {
    return this.adapter.list(bucket, options);
  }

  async delete(bucket: string, paths: string | string[]): Promise<void> {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    return this.adapter.delete(bucket, pathArray);
  }

  async move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    return this.adapter.move(bucket, fromPath, toPath);
  }

  async copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    return this.adapter.copy(bucket, fromPath, toPath);
  }

  // ─────────────────────────────────────────────────────────────────
  // URL operations
  // ─────────────────────────────────────────────────────────────────

  getPublicUrl(
    bucket: string,
    path: string,
    options?: { transform?: ImageTransform }
  ): string {
    const caps = this.getCapabilities();

    if (!caps.files.publicUrls) {
      throw new StorageModuleError(
        'PUBLIC_URLS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support public URLs`,
        400
      );
    }

    if (options?.transform && !caps.files.transformations) {
      throw new StorageModuleError(
        'TRANSFORMATIONS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support image transformations`,
        400
      );
    }

    return this.adapter.getPublicUrl(bucket, path, options);
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    options: SignedUrlOptions
  ): Promise<string> {
    const caps = this.getCapabilities();

    if (!caps.files.signedUrls) {
      throw new StorageModuleError(
        'SIGNED_URLS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support signed URLs`,
        400
      );
    }

    if (options.expiresIn > caps.files.signedUrlMaxAge) {
      throw new StorageModuleError(
        'EXPIRY_TOO_LONG',
        `Expiry time ${options.expiresIn}s exceeds maximum ${caps.files.signedUrlMaxAge}s`,
        400
      );
    }

    if (options.transform && !caps.files.transformations) {
      throw new StorageModuleError(
        'TRANSFORMATIONS_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support image transformations`,
        400
      );
    }

    return this.adapter.getSignedUrl(bucket, path, options);
  }

  // ─────────────────────────────────────────────────────────────────
  // Advanced operations
  // ─────────────────────────────────────────────────────────────────

  async createSignedUploadUrl(
    bucket: string,
    path: string,
    options?: { expiresIn: number }
  ): Promise<{ url: string; token: string }> {
    if (!this.adapter.createSignedUploadUrl) {
      throw new StorageModuleError(
        'SIGNED_UPLOAD_URL_NOT_SUPPORTED',
        `Provider "${this.provider}" does not support signed upload URLs`,
        400
      );
    }

    return this.adapter.createSignedUploadUrl(bucket, path, options);
  }

  // ─────────────────────────────────────────────────────────────────
  // Utility methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Check if a feature is supported
   */
  hasFeature(
    feature: keyof StorageCapabilities['features']
  ): boolean {
    return this.getCapabilities().features[feature];
  }

  /**
   * Check if a specific MIME type is allowed
   */
  isMimeTypeAllowed(mimeType: string): boolean {
    const allowed = this.getCapabilities().files.allowedMimeTypes;
    return allowed === '*' || allowed.includes(mimeType);
  }
}
