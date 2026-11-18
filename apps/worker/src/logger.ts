import { logRedactPaths, REDACT_CENSOR } from "@speakup/shared";
import { pino, type DestinationStream, type Logger } from "pino";

/**
 * JSON logs in prod (machine-parseable), pretty logs in dev. Sensitive fields (emails,
 * transcripts, tokens, audio URLs…) are redacted by the logger itself — the same list as the API.
 * `destination` is for tests that check redaction.
 */
export function createLogger(nodeEnv: string, destination?: DestinationStream): Logger {
  const options = {
    level: nodeEnv === "test" && !destination ? "silent" : "info",
    redact: { paths: logRedactPaths(), censor: REDACT_CENSOR },
  };
  if (destination) return pino(options, destination);
  return pino({
    ...options,
    ...(nodeEnv === "development" && { transport: { target: "pino-pretty" } }),
  });
}
