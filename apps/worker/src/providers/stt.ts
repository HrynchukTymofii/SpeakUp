import type { TranscriptData } from "@speakup/shared";

/** A transcript normalized to our shape, whatever engine produced it. */
export interface SttResult extends TranscriptData {
  /** Length of the audio file in seconds (the engine bills on this). */
  durationSec: number;
  provider: string;
}

/**
 * Speech-to-text behind an interface (SPEC §6.4): the pipeline never imports Deepgram directly,
 * so swapping in Whisper/AssemblyAI later = one new file, no pipeline changes.
 */
export interface SttProvider {
  /** `audioUrl` is a short-lived pre-signed GET URL the engine downloads the audio from. */
  transcribe(audioUrl: string): Promise<SttResult>;
}

/**
 * Future: phoneme-level / accent scoring (Azure Pronunciation Assessment, or our own model
 * service). Interface only — no implementation in the MVP (SPEC §6.4).
 */
export interface PronunciationProvider {
  assess(input: { audioUrl: string; referenceText: string }): Promise<{
    overall: number;
    words: { word: string; score: number }[];
  }>;
}
