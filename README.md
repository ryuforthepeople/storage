# @for-the-people/storage

File storage module with capabilities-based adapter pattern.

## Packages

- **`@for-the-people/storage-core`** - Core types, adapters, and service
- **`@for-the-people/storage-api`** - Hono API routes

## Quick Start

### Installation

```bash
pnpm add @for-the-people/storage-core @for-the-people/storage-api
```

### Basic Usage (Core)

```typescript
import {
  StorageService,
  SupabaseStorageAdapter,
  InMemoryStorageAdapter,
} from '@for-the-people/storage-core';

// With Supabase
const adapter = new SupabaseStorageAdapter({
  url: 'https://your-project.supabase.co',
  key: 'your-anon-key',
});

// Or for testing
const adapter = new InMemoryStorageAdapter();

// Create service
const storage = new StorageService(adapter);

// Check capabilities
const caps = storage.getCapabilities();
console.log(`Provider: ${caps.provider}`);
console.log(`Max file size: ${caps.files.maxSizeBytes}`);

// Create bucket
const bucket = await storage.createBucket('avatars', { public: true });

// Upload file
const file = await storage.upload('avatars', 'user-123.png', fileBuffer, {
  contentType: 'image/png',
  upsert: true,
});

// Get public URL
const url = storage.getPublicUrl('avatars', 'user-123.png');

// Get signed URL (for private files)
const signedUrl = await storage.getSignedUrl('avatars', 'private-doc.pdf', {
  expiresIn: 3600, // 1 hour
  download: true,
});

// List files
const { files, hasMore } = await storage.list('avatars', {
  prefix: 'user-',
  limit: 50,
});

// Delete file
await storage.delete('avatars', 'user-123.png');
```

### API Usage

```typescript
import { Hono } from 'hono';
import { createApp } from '@for-the-people/storage-api';

// Create storage API
const storageApp = createApp({
  supabase: {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_KEY!,
  },
  corsOrigins: ['https://your-app.com'],
});

// Mount on your main app
const app = new Hono();
app.route('/', storageApp);

export default app;
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/storage/capabilities` | Get storage capabilities |
| GET | `/api/v1/storage/buckets` | List all buckets |
| POST | `/api/v1/storage/buckets` | Create bucket |
| GET | `/api/v1/storage/buckets/:name` | Get bucket info |
| DELETE | `/api/v1/storage/buckets/:name` | Delete bucket |
| GET | `/api/v1/storage/:bucket` | List files in bucket |
| POST | `/api/v1/storage/:bucket?path=...` | Upload file |
| GET | `/api/v1/storage/:bucket/:path` | Download file |
| GET | `/api/v1/storage/:bucket/:path?info=true` | Get file info |
| GET | `/api/v1/storage/:bucket/:path?url=true` | Get signed URL |
| GET | `/api/v1/storage/:bucket/:path?public=true` | Get public URL |
| DELETE | `/api/v1/storage/:bucket/:path` | Delete file |
| POST | `/api/v1/storage/:bucket/move` | Move file |
| POST | `/api/v1/storage/:bucket/copy` | Copy file |
| POST | `/api/v1/storage/:bucket/upload-url` | Get signed upload URL |

## Capabilities

The adapter pattern exposes provider capabilities, allowing apps to adapt their behavior:

```typescript
interface StorageCapabilities {
  provider: string;
  version: string;

  buckets: {
    public: boolean;
    private: boolean;
    maxBuckets: number;
  };

  files: {
    maxSizeBytes: number;
    allowedMimeTypes: string[] | '*';
    signedUrls: boolean;
    signedUrlMaxAge: number;
    publicUrls: boolean;
    transformations: boolean;
  };

  features: {
    folders: boolean;
    metadata: boolean;
    versioning: boolean;
    resumableUpload: boolean;
    multipartUpload: boolean;
  };
}
```

## Adapters

### Supabase Storage

Full-featured adapter for Supabase Storage:
- Public and private buckets
- Signed URLs (up to 7 days)
- Image transformations (resize, crop, format conversion)
- Resumable uploads

### In-Memory (Testing)

Simple in-memory adapter for testing:
- All bucket operations
- Basic file operations
- Fake URL generation
- No image transformations

## Creating Custom Adapters

Implement the `StorageAdapter` interface:

```typescript
import type { StorageAdapter } from '@for-the-people/storage-core';

export class MyStorageAdapter implements StorageAdapter {
  readonly provider = 'my-provider';

  getCapabilities() {
    return {
      provider: 'my-provider',
      version: '1.0.0',
      // ... capabilities
    };
  }

  async upload(bucket, path, file, options) {
    // Implementation
  }

  // ... implement all methods
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type check
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## License

MIT
