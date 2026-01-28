import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter } from './adapter.js';
import type {
  StorageCapabilities,
  Bucket,
  FileRecord,
  UploadOptions,
  ListOptions,
  SignedUrlOptions,
  ImageTransform,
  SupabaseStorageConfig,
} from '../types/index.js';
import { StorageModuleError } from '../types/index.js';

/**
 * Supabase Storage adapter implementation
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly provider = 'supabase';

  private client: SupabaseClient;
  private config: SupabaseStorageConfig;

  constructor(config: SupabaseStorageConfig) {
    this.config = config;
    this.client = createClient(config.url, config.key);
  }

  getCapabilities(): StorageCapabilities {
    return {
      provider: 'supabase',
      version: '2.0.0',
      buckets: {
        public: true,
        private: true,
        maxBuckets: 100,
      },
      files: {
        maxSizeBytes: 50 * 1024 * 1024, // 50MB free tier, 5GB on pro
        allowedMimeTypes: '*',
        signedUrls: true,
        signedUrlMaxAge: 7 * 24 * 60 * 60, // 7 days
        publicUrls: true,
        transformations: true,
      },
      features: {
        folders: true,
        metadata: true,
        versioning: false,
        resumableUpload: true,
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
    const { data, error } = await this.client.storage.createBucket(name, {
      public: options?.public ?? false,
    });

    if (error) {
      throw new StorageModuleError(
        'BUCKET_CREATE_FAILED',
        error.message,
        400
      );
    }

    return {
      id: data.name,
      name: data.name,
      public: options?.public ?? false,
      createdAt: new Date().toISOString(),
    };
  }

  async getBucket(name: string): Promise<Bucket | null> {
    const { data, error } = await this.client.storage.getBucket(name);

    if (error) {
      if (error.message.includes('not found')) {
        return null;
      }
      throw new StorageModuleError('BUCKET_GET_FAILED', error.message, 400);
    }

    return {
      id: data.id,
      name: data.name,
      public: data.public,
      createdAt: data.created_at,
      allowedMimeTypes: data.allowed_mime_types ?? undefined,
      maxFileSize: data.file_size_limit ?? undefined,
    };
  }

  async listBuckets(): Promise<Bucket[]> {
    const { data, error } = await this.client.storage.listBuckets();

    if (error) {
      throw new StorageModuleError('BUCKET_LIST_FAILED', error.message, 400);
    }

    return data.map((b) => ({
      id: b.id,
      name: b.name,
      public: b.public,
      createdAt: b.created_at,
      allowedMimeTypes: b.allowed_mime_types ?? undefined,
      maxFileSize: b.file_size_limit ?? undefined,
    }));
  }

  async deleteBucket(name: string): Promise<void> {
    const { error } = await this.client.storage.deleteBucket(name);

    if (error) {
      throw new StorageModuleError('BUCKET_DELETE_FAILED', error.message, 400);
    }
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
    // Convert Buffer/ArrayBuffer to Blob for Supabase
    let uploadFile: File | Blob;
    if (Buffer.isBuffer(file)) {
      uploadFile = new Blob([new Uint8Array(file)]);
    } else if (file instanceof ArrayBuffer) {
      uploadFile = new Blob([new Uint8Array(file)]);
    } else {
      uploadFile = file;
    }

    const { data, error } = await this.client.storage
      .from(bucket)
      .upload(path, uploadFile, {
        contentType: options?.contentType,
        cacheControl: options?.cacheControl,
        upsert: options?.upsert ?? false,
        // metadata is passed through headers in Supabase
      });

    if (error) {
      throw new StorageModuleError('UPLOAD_FAILED', error.message, 400);
    }

    // Get file info after upload
    const info = await this.getFileInfo(bucket, path);
    if (!info) {
      // Return basic info if we can't get full details
      return {
        id: data.id ?? data.path,
        name: path.split('/').pop() ?? path,
        bucket,
        path: data.path,
        size: uploadFile.size,
        mimeType: options?.contentType ?? 'application/octet-stream',
        metadata: options?.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return info;
  }

  async download(bucket: string, path: string): Promise<Blob> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .download(path);

    if (error) {
      throw new StorageModuleError('DOWNLOAD_FAILED', error.message, 400);
    }

    return data;
  }

  async getFileInfo(bucket: string, path: string): Promise<FileRecord | null> {
    // Supabase doesn't have a direct "get file info" method
    // We need to list the directory and find the file
    const dir = path.split('/').slice(0, -1).join('/') || '';
    const fileName = path.split('/').pop() ?? '';

    const { data, error } = await this.client.storage
      .from(bucket)
      .list(dir, { search: fileName });

    if (error) {
      throw new StorageModuleError('FILE_INFO_FAILED', error.message, 400);
    }

    const file = data.find((f) => f.name === fileName);
    if (!file) {
      return null;
    }

    return {
      id: file.id ?? path,
      name: file.name,
      bucket,
      path: dir ? `${dir}/${file.name}` : file.name,
      size: file.metadata?.size ?? 0,
      mimeType: file.metadata?.mimetype ?? 'application/octet-stream',
      metadata: file.metadata as Record<string, string> | undefined,
      createdAt: file.created_at ?? new Date().toISOString(),
      updatedAt: file.updated_at ?? file.created_at ?? new Date().toISOString(),
    };
  }

  async list(
    bucket: string,
    options?: ListOptions
  ): Promise<{ files: FileRecord[]; hasMore: boolean }> {
    const { data, error } = await this.client.storage.from(bucket).list(
      options?.prefix ?? '',
      {
        limit: options?.limit ?? 100,
        offset: options?.offset ?? 0,
        sortBy: options?.sortBy
          ? {
              column: options.sortBy.column,
              order: options.sortBy.order,
            }
          : undefined,
      }
    );

    if (error) {
      throw new StorageModuleError('LIST_FAILED', error.message, 400);
    }

    const files: FileRecord[] = data
      .filter((f) => f.id !== null) // Filter out folder placeholders
      .map((f) => ({
        id: f.id ?? f.name,
        name: f.name,
        bucket,
        path: options?.prefix ? `${options.prefix}/${f.name}` : f.name,
        size: f.metadata?.size ?? 0,
        mimeType: f.metadata?.mimetype ?? 'application/octet-stream',
        metadata: f.metadata as Record<string, string> | undefined,
        createdAt: f.created_at ?? new Date().toISOString(),
        updatedAt: f.updated_at ?? f.created_at ?? new Date().toISOString(),
      }));

    return {
      files,
      hasMore: data.length === (options?.limit ?? 100),
    };
  }

  async delete(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove(paths);

    if (error) {
      throw new StorageModuleError('DELETE_FAILED', error.message, 400);
    }
  }

  async move(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    const { error } = await this.client.storage
      .from(bucket)
      .move(fromPath, toPath);

    if (error) {
      throw new StorageModuleError('MOVE_FAILED', error.message, 400);
    }

    const info = await this.getFileInfo(bucket, toPath);
    if (!info) {
      throw new StorageModuleError(
        'MOVE_FAILED',
        'File moved but could not retrieve info',
        500
      );
    }

    return info;
  }

  async copy(
    bucket: string,
    fromPath: string,
    toPath: string
  ): Promise<FileRecord> {
    const { error } = await this.client.storage
      .from(bucket)
      .copy(fromPath, toPath);

    if (error) {
      throw new StorageModuleError('COPY_FAILED', error.message, 400);
    }

    const info = await this.getFileInfo(bucket, toPath);
    if (!info) {
      throw new StorageModuleError(
        'COPY_FAILED',
        'File copied but could not retrieve info',
        500
      );
    }

    return info;
  }

  // ─────────────────────────────────────────────────────────────────
  // URL operations
  // ─────────────────────────────────────────────────────────────────

  getPublicUrl(
    bucket: string,
    path: string,
    options?: { transform?: ImageTransform }
  ): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(path, {
      transform: options?.transform
        ? {
            width: options.transform.width,
            height: options.transform.height,
            resize: options.transform.resize,
            quality: options.transform.quality,
            // Supabase transform only supports 'origin' format, use query params for actual format
            format: options.transform.format ? 'origin' : undefined,
          }
        : undefined,
    });

    // Append format as query parameter if specified
    if (options?.transform?.format) {
      const url = new URL(data.publicUrl);
      url.searchParams.set('format', options.transform.format);
      return url.toString();
    }

    return data.publicUrl;
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    options: SignedUrlOptions
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, options.expiresIn, {
        download: options.download,
        transform: options.transform
          ? {
              width: options.transform.width,
              height: options.transform.height,
              resize: options.transform.resize,
              quality: options.transform.quality,
              // Supabase transform only supports 'origin' format
              format: options.transform.format ? 'origin' : undefined,
            }
          : undefined,
      });

    if (error) {
      throw new StorageModuleError('SIGNED_URL_FAILED', error.message, 400);
    }

    // Append format as query parameter if specified
    if (options.transform?.format) {
      const url = new URL(data.signedUrl);
      url.searchParams.set('format', options.transform.format);
      return url.toString();
    }

    return data.signedUrl;
  }

  async createSignedUploadUrl(
    bucket: string,
    path: string,
    options?: { expiresIn: number }
  ): Promise<{ url: string; token: string }> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw new StorageModuleError(
        'SIGNED_UPLOAD_URL_FAILED',
        error.message,
        400
      );
    }

    return {
      url: data.signedUrl,
      token: data.token,
    };
  }
}
