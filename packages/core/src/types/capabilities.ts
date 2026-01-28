/**
 * Storage provider capabilities
 * Used by apps to know what features are available
 */
export interface StorageCapabilities {
  /** Provider identifier */
  provider: string;
  /** Provider/adapter version */
  version: string;

  /** Bucket capabilities */
  buckets: {
    /** Public buckets supported */
    public: boolean;
    /** Private buckets supported */
    private: boolean;
    /** Maximum number of buckets */
    maxBuckets: number;
  };

  /** File capabilities */
  files: {
    /** Maximum file size in bytes */
    maxSizeBytes: number;
    /** Allowed MIME types, or '*' for all */
    allowedMimeTypes: string[] | '*';
    /** Signed URL support */
    signedUrls: boolean;
    /** Maximum signed URL lifetime in seconds */
    signedUrlMaxAge: number;
    /** Public URL support */
    publicUrls: boolean;
    /** Image transformation support */
    transformations: boolean;
  };

  /** Feature flags */
  features: {
    /** Folder/prefix support */
    folders: boolean;
    /** Custom metadata on files */
    metadata: boolean;
    /** File versioning */
    versioning: boolean;
    /** Resumable uploads */
    resumableUpload: boolean;
    /** Multipart uploads */
    multipartUpload: boolean;
  };
}
