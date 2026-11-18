import { DeleteObjectsCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Long enough for Deepgram to download the file, short enough to be useless if it leaks. */
const DOWNLOAD_TTL_SECONDS = 10 * 60;

export interface AudioStorage {
  /** A temporary read-only URL for one recording (the bucket itself stays private). */
  getDownloadUrl(key: string): Promise<string>;
  /** Deletes recordings (cleanup job). Missing keys are not an error. */
  deleteObjects(keys: string[]): Promise<void>;
}

export function createS3AudioStorage(opts: {
  region: string;
  bucket: string;
  endpoint?: string;
}): AudioStorage {
  const s3 = new S3Client({
    region: opts.region,
    ...(opts.endpoint && { endpoint: opts.endpoint, forcePathStyle: true }),
  });
  return {
    getDownloadUrl: (key) =>
      // Signing happens locally (no network call): the URL carries our signature + expiry.
      getSignedUrl(s3, new GetObjectCommand({ Bucket: opts.bucket, Key: key }), {
        expiresIn: DOWNLOAD_TTL_SECONDS,
      }),

    async deleteObjects(keys) {
      // One request deletes up to 1000 objects.
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const res = await s3.send(
          new DeleteObjectsCommand({
            Bucket: opts.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        // DeleteObjects reports per-key failures in the body instead of throwing.
        if (res.Errors?.length)
          throw new Error(`${res.Errors.length} objects could not be deleted`);
      }
    },
  };
}
