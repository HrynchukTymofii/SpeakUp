import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE_RATE } from "./signal.js";

/** Turns a recording into raw samples we can measure. Behind an interface so tests fake it. */
export interface AudioDecoder {
  /** Mono Float32 PCM at 16 kHz. `audioUrl` is a short-lived pre-signed GET URL. */
  decode(audioUrl: string): Promise<Float32Array>;
}

const TIMEOUT_MS = 30_000;
/** 10 MB upload cap (MAX_UPLOAD_BYTES) ≈ minutes of audio; 15 min of PCM is a safe ceiling. */
const MAX_PCM_BYTES = 15 * 60 * SAMPLE_RATE * 4;

/**
 * Decodes with the ffmpeg binary (browsers record WebM/Opus, Safari MP4/AAC, Firefox Ogg —
 * ffmpeg reads all of them).
 *
 * The file is downloaded to a temp file first instead of piped: MP4 files may keep their index
 * ("moov atom") at the END, which ffmpeg can only reach by seeking — impossible on a pipe.
 */
export function createFfmpegDecoder(ffmpegPath = "ffmpeg"): AudioDecoder {
  return {
    async decode(audioUrl) {
      const res = await fetch(audioUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`audio download failed: HTTP ${res.status}`);
      const dir = await mkdtemp(join(tmpdir(), "speakup-audio-"));
      const input = join(dir, "input");
      try {
        await writeFile(input, Buffer.from(await res.arrayBuffer()));
        const pcm = await runFfmpeg(ffmpegPath, [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          input,
          "-ac",
          "1", // mono
          "-ar",
          String(SAMPLE_RATE),
          "-f",
          "f32le", // raw little-endian float32
          "pipe:1",
        ]);
        // Copy into an aligned buffer: Float32Array needs a byte offset divisible by 4.
        const aligned = new Uint8Array(pcm.length - (pcm.length % 4));
        aligned.set(pcm.subarray(0, aligned.length));
        return new Float32Array(aligned.buffer);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

function runFfmpeg(path: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), TIMEOUT_MS);
    proc.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PCM_BYTES) proc.kill("SIGKILL");
      else chunks.push(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-500);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}
