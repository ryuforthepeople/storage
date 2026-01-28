// Types
export type {
  StorageCapabilities,
  Bucket,
  FileRecord,
  UploadOptions,
  ListOptions,
  SignedUrlOptions,
  ImageTransform,
  StorageErrorData,
  SupabaseStorageConfig,
} from './types/index.js';

export { StorageModuleError } from './types/index.js';

// Adapter interface
export type { StorageAdapter } from './adapters/adapter.js';

// Supabase adapter
export { SupabaseStorageAdapter } from './adapters/supabase.js';

// In-memory adapter (for testing)
export { InMemoryStorageAdapter } from './adapters/memory.js';

// Service
export { StorageService } from './services/storage.js';
