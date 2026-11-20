import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import type { Logger } from "pino";

/**
 * Publishes the analysis queue's depth to CloudWatch, the signal ECS uses to add and remove
 * workers (infra/cdk, docs/scaling.md). CPU is the wrong signal: a worker spends most of a job
 * waiting on the STT/LLM APIs, so CPU stays moderate while users wait. Queue depth is what
 * they feel. Every worker publishes the same queue-wide numbers; the alarm uses Maximum.
 */

export interface MetricSink {
  put(namespace: string, metrics: { name: string; value: number }[]): Promise<void>;
}

/** The slice of a BullMQ Queue we read. */
export interface QueueCounts {
  getJobCounts(...types: string[]): Promise<Record<string, number | undefined>>;
}

export function createCloudWatchSink(region: string): MetricSink {
  const client = new CloudWatchClient({ region });
  return {
    async put(namespace, metrics) {
      await client.send(
        new PutMetricDataCommand({
          Namespace: namespace,
          MetricData: metrics.map((m) => ({ MetricName: m.name, Value: m.value, Unit: "Count" })),
        }),
      );
    },
  };
}

export async function publishQueueDepth(
  queue: QueueCounts,
  sink: MetricSink,
  namespace: string,
  log: Logger,
): Promise<void> {
  try {
    const c = await queue.getJobCounts("wait", "prioritized", "active");
    await sink.put(namespace, [
      // Prioritized jobs are waiting too (BullMQ keeps them in a separate list).
      { name: "QueueWaiting", value: (c.wait ?? 0) + (c.prioritized ?? 0) },
      { name: "QueueActive", value: c.active ?? 0 },
    ]);
  } catch (err) {
    log.warn({ err: (err as Error).message }, "could not publish queue metrics");
  }
}
