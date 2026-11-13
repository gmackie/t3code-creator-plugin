import { homedir } from "node:os";
import { join } from "node:path";

// The v1 settings (creator.workspace, creator.polling-seconds) and the v1
// runtime env (T3_PLUGIN_COMMAND, T3_PLUGIN_PUBLISH_COMMAND,
// T3_PLUGIN_STATE_FILE) map onto these env vars, declared in the v2 manifest
// under mcpServer.transport.env.
export type CreatorConfig = {
  readonly command: readonly string[];
  readonly publishCommand: readonly string[];
  readonly workspaceId: string;
  readonly pollSeconds: number;
  readonly statePath: string;
};

export const POLL_SECONDS = { default: 60, min: 15, max: 3600 } as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): CreatorConfig {
  return {
    command: words(env.CREATOR_COMMAND),
    publishCommand: words(env.CREATOR_PUBLISH_COMMAND),
    workspaceId: env.CREATOR_WORKSPACE?.trim() || "default",
    pollSeconds: pollSeconds(env.CREATOR_POLL_SECONDS),
    statePath: env.CREATOR_STATE_PATH?.trim() || defaultStatePath(env),
  };
}

// Commands are split on whitespace, like v1; no shell is involved.
function words(value: string | undefined): readonly string[] {
  return value?.trim().split(/\s+/u).filter(Boolean) ?? [];
}

function pollSeconds(raw: string | undefined): number {
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) return POLL_SECONDS.default;
  return Math.min(POLL_SECONDS.max, Math.max(POLL_SECONDS.min, Math.round(value)));
}

// T3 does not hand plugins a data directory, so approval state defaults to the
// XDG state dir and never to T3's own userdata.
function defaultStatePath(env: Record<string, string | undefined>): string {
  const base = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(base, "t3code-creator-plugin", "state.json");
}
