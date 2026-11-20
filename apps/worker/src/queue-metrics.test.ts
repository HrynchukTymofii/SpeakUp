import { describe, expect, it } from "vitest";
import { publishQueueDepth, type MetricSink } from "./queue-metrics.js";
import { silentLog } from "./testing/fakes.js";

class FakeSink implements MetricSink {
  sent: { namespace: string; metrics: { name: string; value: number }[] }[] = [];
  fail = false;
  async put(namespace: string, metrics: { name: string; value: number }[]) {
    if (this.fail) throw new Error("throttled");
    this.sent.push({ namespace, metrics });
  }
}

const counts = async () => ({ wait: 12, prioritized: 3, active: 4, delayed: 1 });

describe("publishQueueDepth", () => {
  it("publishes waiting (incl. prioritized) and active jobs: the worker autoscaling signal", async () => {
    const sink = new FakeSink();
    await publishQueueDepth({ getJobCounts: counts }, sink, "SpeakUp/LoadTest", silentLog);
    expect(sink.sent).toEqual([
      {
        namespace: "SpeakUp/LoadTest",
        metrics: [
          { name: "QueueWaiting", value: 15 },
          { name: "QueueActive", value: 4 },
        ],
      },
    ]);
  });

  it("never throws: a failed publish must not take the worker down", async () => {
    const sink = new FakeSink();
    sink.fail = true;
    await expect(
      publishQueueDepth({ getJobCounts: counts }, sink, "ns", silentLog),
    ).resolves.toBeUndefined();
  });
});
