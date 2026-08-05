import fs from "node:fs";
import path from "node:path";

const FILE_NAME = "pending-retained-topic-clears.json";

interface PendingRetainedTopicClearsFile {
  schema: 1;
  topics: string[];
}

const normalizeTopics = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const topics = (value as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) return [];
  return [...new Set(topics.filter(
    (topic): topic is string =>
      typeof topic === "string" &&
      Boolean(topic.trim()) &&
      !topic.includes("#") &&
      !topic.includes("+"),
  ).map((topic) => topic.trim()))];
};

/** Persist MQTT retained-topic tombstones across Add-on restarts. */
export class RetainedTopicStorage {
  constructor(private readonly dataDir: string) {}

  list(): string[] {
    const filePath = this.filePath();
    if (!fs.existsSync(filePath)) return [];
    try {
      return normalizeTopics(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
    } catch {
      return [];
    }
  }

  add(topic: string): void {
    const normalized = topic.trim();
    if (!normalized || normalized.includes("#") || normalized.includes("+")) {
      throw new Error("Invalid retained MQTT topic");
    }
    this.write([...this.list(), normalized]);
  }

  remove(topic: string): void {
    this.write(this.list().filter((entry) => entry !== topic));
  }

  private write(topics: string[]): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const filePath = this.filePath();
    const tempPath = `${filePath}.tmp`;
    const payload: PendingRetainedTopicClearsFile = {
      schema: 1,
      topics: [...new Set(topics)],
    };
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  private filePath(): string {
    return path.join(this.dataDir, FILE_NAME);
  }
}
