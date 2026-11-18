import {
  DeleteObjectTaggingCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES, type PresignedUpload } from "@speakup/shared";

/** How long a pre-signed upload stays valid (SPEC §6.2: 5 minutes). */
const UPLOAD_TTL_SECONDS = 5 * 60;

/**
 * Every upload starts tagged `upload-status=pending`. The bucket's lifecycle rule
 * (`expire-abandoned-uploads`) deletes objects that still carry this tag after 1 day, so
 * recordings that were uploaded but never submitted clean themselves up (SPEC §9).
 * Submit removes the tag, which takes the object out of the rule's scope.
 * S3 expects the tag set as this XML string in a POST form field.
 */
const PENDING_TAGGING =
  "<Tagging><TagSet><Tag><Key>upload-status</Key><Value>pending</Value></Tag></TagSet></Tagging>";

/**
 * What the API needs from object storage. Routes depend on this interface, not on the AWS SDK,
 * so tests use an in-memory fake and only this file knows S3's API.
 */
export interface Storage {
  /** A short-lived, single-purpose permission for the browser to upload ONE file to `key`. */
  createUpload(key: string, contentType: string): Promise<PresignedUpload>;
  /** Size in bytes of the stored object, or null if it doesn't exist. */
  getObjectSize(key: string): Promise<number | null>;
  /** The recording was submitted: remove the "pending" tag so the lifecycle rule keeps it. */
  markSubmitted(key: string): Promise<void>;
}

export function createS3Storage(opts: {
  region: string;
  bucket: string;
  /** Set only for a local emulator (LocalStack). Real AWS uses the default endpoint. */
  endpoint?: string;
}): Storage {
  const s3 = new S3Client({
    region: opts.region,
    ...(opts.endpoint && {
      endpoint: opts.endpoint,
      // Emulators serve buckets at http://host/bucket instead of http://bucket.host.
      forcePathStyle: true,
    }),
  });

  return {
    async createUpload(key, contentType) {
      // The policy is signed with our credentials. S3 rejects the upload if ANY condition
      // fails, so the browser can't change the key, the type, or upload a 2 GB file.
      const { url, fields } = await createPresignedPost(s3, {
        Bucket: opts.bucket,
        Key: key, // also adds an exact-match condition on the key
        Fields: { "Content-Type": contentType, tagging: PENDING_TAGGING },
        Conditions: [
          ["eq", "$Content-Type", contentType],
          // Signed too, so the browser can't drop the tag and dodge the cleanup rule.
          ["eq", "$tagging", PENDING_TAGGING],
          ["content-length-range", MIN_UPLOAD_BYTES, MAX_UPLOAD_BYTES],
        ],
        Expires: UPLOAD_TTL_SECONDS,
      });
      return {
        url,
        fields,
        maxBytes: MAX_UPLOAD_BYTES,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      };
    },

    async getObjectSize(key) {
      try {
        // HEAD reads only metadata — no audio is downloaded through the API.
        const head = await s3.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (err) {
        if (err instanceof NotFound) return null;
        throw err;
      }
    },

    async markSubmitted(key) {
      // Idempotent: deleting tags that are already gone succeeds, so retried submits are fine.
      await s3.send(new DeleteObjectTaggingCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}
