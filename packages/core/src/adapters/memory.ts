import type { StorageAdapter } from './adapter.js';
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

interface StoredFile {
  data: Buffer;
  info: FileRecord;
}

/**
 * In-memory storage adapter for testing
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  readonly provider = 'memory';

  private buckets = new Map<string, Bucket>();
  private files = new Map<string, StoredFile>(); // key: bucket/path

  getCapabilities(): StorageCapabilities {
    return {
      provider: 'memory',
      version: '1.0.0',
      buckets: {
        public: true,
        private: true,
        maxBuckets: 1000,
      },
      files: {
        maxSizeBytes: 100 * 1024 * 1024, // 100MB
        allowedMimeTypes: '*',
        signedUrls: true,
        signedUrlMaxAge: 86400, // 1 day
        publicUrls: true,
        transformations: false, // No image transforms in memory adapter
      },
      features: {
        folders: true,
        metadata: true,
        versioning: false,
        resumableUpload: false,
        multipartUpload: false,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Bucket operations
  // ─────────────────────────────────────────────────────────────────

  async createBucket(
    name: string,
    options?: { public?: boolean }
  ): Promise<Bucket> {
    if (this.buckets.has(name)) {
      throw new StorageModuleError(
        'BUCKET_EXISTS',
        `Bucket "${name}" already exists`,
        409
      );
    }

    const bucket: Bucket = {
      id: name,
      name,
      public: options?.public ?? false,
      createdAt: new Date().toISOString(),
    };

    this.buckets.set(name, bucket);
    return bucket;
  }

  async getBucket(name: string): Promise<Bucket | null> {
    return this.buckets.get(name) ?? null;
  }

  async listBuckets(): Promise<Bucket[]> {
    return Array.from(this.buckets.values());
  }

  async deleteBucket(name: string): Promise<void> {
    if (!this.buckets.has(name)) {
      throw new StorageModuleError(
        'BUCKET_NOT_FOUND',
        `Bucket "${name}" not found`,
        404
      );
    }

    // Check if bucket is empty
    const prefix = `${name}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        throw new StorageModuleError(
          'BUCKET_NOT_EMPTY',
          `Bucket "${name}" is not empty`,
          400
        );
      }
    }

    this.buckets.delete(name);
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
    if (!this.buckets.has(bucket)) {
      throw new StorageModuleError(
        'BUCKET_NOT_FOUND',
        `Bucket "${bucket}" not found`,
        404
      );
    }

    const key = `${bucket}/${path}`;

    // Check if file exists and upsert is not enabled
    if (this.files.has(key) && !options?.upsert) {
      throw new StorageModuleError(
        'FILE_EXISTS',
        `File "${path}" already exists in bucket "${bucket}"`,
        409
      );
    }

    // Convert to Buffer
    let buffer: Buffer;
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (file instanceof ArrayBuffer) {
      buffer = Buffer.from(file);
    } else {
      // Blob or File
      const arrayBuffer = await (file as Blob).arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const now = new Date().toISOString();
    const fileName = path.split('/').pop() ?? path;

    // Determine content type
    let mimeType = options?.contentType ?? 'application/octet-stream';
    if (!options?.contentType && file instanceof Blob) {
      mimeType = file.type || mimeType;
    }

    const info: FileRecord = {
      id: crypto.randomUUID(),
      name: fileName,
      bucket,
      path,
      size: buffer.length,
      mimeType,
      metadata: options?.metadata,
      createdAt: this.files.get(key)?.info.createdAt ?? now,
      updatedAt: now,
    };

    this.files.set(key, { data: buffer, info });
    return info;
  }

  async download(bucket: string, path: string): Promise<Blob> {
    const key = `${bucket}/${path}`;
    const stored = this.files.get(key);

    if (!stored) {
      throw new StorageModuleError(
        'FILE_NOT_FOUND',
        `File "${path}" not found in bucket "${bucket}"`,
        404
      );
    }

    return new Blob([new Uint8Array(stored.data)], { type: stored.info.mimeType });
  }

  async getFileInfo(bucket: string, path: string): Promise<FileRecord | null> {
    const key = `${bucket}/${path}`;
    const stored = this.files.get(key);
    return stored?.info ?? null;
  }

  async list(
    bucket: string,
    options?: ListOptions
  ): Promise<{ files: FileRecord[]; hasMore: boolean }> {
    if (!this.buckets.has(bucket)) {
      throw new StorageModuleError(
        'BUCKET_NOT_FOUND',
        `Bucket "${bucket}" not found`,
        404
      );
    }

    const prefix = options?.prefix ? `${bucket}/${options.prefix}` : `${bucket}/`;
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let files: FileRecord[] = [];
    for (const [key, stored] of this.files.entries()) {
      if (key.startsWith(prefix)) {
        files.push(stored.info);
      }
    }

    // Sort
    if (options?.sortBy) {
      const { column, order } = options.sortBy;
      files.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        switch (column) {
          case 'name':
            aVal = a.name;
            bVal = b.name;
            break;
          case 'created_at':
            aVal = a.createdAt;
            bVal = b.createdAt;
            break;
          case 'updated_at':
            aVal = a.updatedAt;
            bVal = b.updatedAt;
            break;
        }

        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Paginate
    const paged = files.slice(offset, offset + limit);

    return {
      files: paged,
      hasMore: offset + limit < files.length,
    };
  }

  async delete(bucket: string, paths: string[]): Promise<void> {
    for (const path of paths) {
      const key = `${bucket}/${path}`;
      if (!this.files.has(key)) {
        throw new StorageModuleError(
          'FILE_NOT_FOUND',
          `File "${path}" not found in bucket "${bucket}"`,
          404
        );
      }
      this.files.delete(key);
    }
  }

  async move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    const fromKey = `${bucket}/${fromPath}`;
    const toKey = `${bucket}/${toPath}`;

    const stored = this.files.get(fromKey);
    if (!stored) {
      throw new StorageModuleError(
        'FILE_NOT_FOUND',
        `File "${fromPath}" not found in bucket "${bucket}"`,
        404
      );
    }

    if (this.files.has(toKey)) {
      throw new StorageModuleError(
        'FILE_EXISTS',
        `File "${toPath}" already exists in bucket "${bucket}"`,
        409
      );
    }

    const newInfo: FileRecord = {
      ...stored.info,
      name: toPath.split('/').pop() ?? toPath,
      path: toPath,
      updatedAt: new Date().toISOString(),
    };

    this.files.set(toKey, { data: stored.data, info: newInfo });
    this.files.delete(fromKey);

    return newInfo;
  }

  async copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    const fromKey = `${bucket}/${fromPath}`;
    const toKey = `${bucket}/${toPath}`;

    const stored = this.files.get(fromKey);
    if (!stored) {
      throw new StorageModuleError(
        'FILE_NOT_FOUND',
        `File "${fromPath}" not found in bucket "${bucket}"`,
        404
      );
    }

    if (this.files.has(toKey)) {
      throw new StorageModuleError(
        'FILE_EXISTS',
        `File "${toPath}" already exists in bucket "${bucket}"`,
        409
      );
    }

    const now = new Date().toISOString();
    const newInfo: FileRecord = {
      ...stored.info,
      id: crypto.randomUUID(),
      name: toPath.split('/').pop() ?? toPath,
      path: toPath,
      createdAt: now,
      updatedAt: now,
    };

    // Copy the buffer
    const newBuffer = Buffer.from(stored.data);
    this.files.set(toKey, { data: newBuffer, info: newInfo });

    return newInfo;
  }

  // ─────────────────────────────────────────────────────────────────
  // URL operations
  // ─────────────────────────────────────────────────────────────────

  getPublicUrl(
    bucket: string,
    path: string,
    options?: { transform?: ImageTransform }
  ): string {
    // Generate fake public URL
    const base = 'http://localhost:3000/storage';
    let url = `${base}/${bucket}/${path}`;

    if (options?.transform) {
      const params = new URLSearchParams();
      if (options.transform.width) params.set('w', String(options.transform.width));
      if (options.transform.height) params.set('h', String(options.transform.height));
      if (options.transform.resize) params.set('resize', options.transform.resize);
      if (options.transform.quality) params.set('q', String(options.transform.quality));
      if (options.transform.format) params.set('f', options.transform.format);
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    }

    return url;
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    options: SignedUrlOptions
  ): Promise<string> {
    const key = `${bucket}/${path}`;
    if (!this.files.has(key)) {
      throw new StorageModuleError(
        'FILE_NOT_FOUND',
        `File "${path}" not found in bucket "${bucket}"`,
        404
      );
    }

    // Generate fake signed URL
    const token = crypto.randomUUID();
    const expires = Date.now() + options.expiresIn * 1000;
    let url = `http://localhost:3000/storage/${bucket}/${path}?token=${token}&expires=${expires}`;

    if (options.download) {
      const filename =
        typeof options.download === 'string'
          ? options.download
          : path.split('/').pop() ?? 'download';
      url += `&download=${encodeURIComponent(filename)}`;
    }

    return url;
  }

  async createSignedUploadUrl(
    bucket: string,
    path: string,
    options?: { expiresIn: number }
  ): Promise<{ url: string; token: string }> {
    if (!this.buckets.has(bucket)) {
      throw new StorageModuleError(
        'BUCKET_NOT_FOUND',
        `Bucket "${bucket}" not found`,
        404
      );
    }

    const token = crypto.randomUUID();
    const expires = Date.now() + (options?.expiresIn ?? 3600) * 1000;

    return {
      url: `http://localhost:3000/storage/${bucket}/${path}?token=${token}&expires=${expires}`,
      token,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Test utilities
  // ─────────────────────────────────────────────────────────────────

  /** Clear all data (for testing) */
  clear(): void {
    this.buckets.clear();
    this.files.clear();
  }

  /** Get raw file data (for testing) */
  getRawFile(bucket: string, path: string): Buffer | null {
    return this.files.get(`${bucket}/${path}`)?.data ?? null;
  }
}
