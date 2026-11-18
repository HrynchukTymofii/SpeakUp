import type { PresignedUpload } from "@speakup/shared";

/** S3 rejected the upload (expired policy, wrong type, file too big…). */
export class UploadError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed (${status})`);
    this.name = "UploadError";
  }
}

/**
 * Uploads a recording straight to S3 with a pre-signed POST — the audio never passes through
 * our API. No Authorization header: the signed `fields` ARE the permission, and they only
 * allow this one key, this content type and this size range, for 5 minutes.
 */
export async function uploadToS3(upload: PresignedUpload, file: Blob): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  // S3 ignores every form field that comes after the file, so the file must be last.
  form.append("file", file);

  const res = await fetch(upload.url, { method: "POST", body: form });
  if (!res.ok) throw new UploadError(res.status);
}
