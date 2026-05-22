/**
 * Lightweight, dependency-free analytics for the CLI. Events accumulate in
 * memory during a run and are flushed once as a single plain-`fetch` POST to
 * the web app's `/api/events` route, which forwards them to PostHog. We never
 * bundle `posthog-node`.
 *
 * Identity is ephemeral: a fresh random UUID per process (no on-disk state).
 * Suppressed by `--no-telemetry`, env vars, or CI detection.
 */

const DEFAULT_TELEMETRY_URL = "https://stanza.tools/api/events";

type EventInput = {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
};

let configured = false;
let disabled = true;
let baseProperties: Record<string, unknown> = {};
const queue: EventInput[] = [];
const distinctId = randomId();

function randomId(): string {
  // `crypto` is a global in Node 18+; avoids importing node:crypto.
  return globalThis.crypto.randomUUID();
}

function envFlag(value: string | undefined, truthy: readonly string[]): boolean {
  return value !== undefined && truthy.includes(value.toLowerCase());
}

function isCI(): boolean {
  return Boolean(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.BUILD_NUMBER,
  );
}

export function isTelemetryDisabled(rawArgs: string[]): boolean {
  if (rawArgs.includes("--no-telemetry")) return true;
  if (envFlag(process.env.STANZA_TELEMETRY, ["0", "false", "off", "no"])) return true;
  if (envFlag(process.env.DO_NOT_TRACK, ["1", "true"])) return true;
  if (isCI()) return true;
  return false;
}

export function configure(opts: { command: string; version: string; disabled: boolean }): void {
  configured = true;
  disabled = opts.disabled;
  baseProperties = {
    command: opts.command,
    cli_version: opts.version,
    node_version: process.versions.node,
    os: process.platform,
    arch: process.arch,
  };
}

export function capture(event: string, properties: Record<string, unknown> = {}): void {
  if (!configured || disabled) return;
  queue.push({
    event,
    properties: { ...baseProperties, ...properties },
    timestamp: new Date().toISOString(),
  });
}

export async function flush(): Promise<void> {
  if (disabled || queue.length === 0) return;
  const url = process.env.STANZA_TELEMETRY_URL ?? DEFAULT_TELEMETRY_URL;
  const events = queue.splice(0, queue.length);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ distinctId, events }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Fire-and-forget: network failure, timeout, and non-2xx are all ignored.
    // Telemetry must never break or slow a real command.
  }
}
