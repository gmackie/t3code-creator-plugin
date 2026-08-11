import { createCreatorClient, type CreatorSnapshot, type CreatorWorkflowState } from "./creator.ts";
import { createRpcHandler } from "./rpc.ts";

let snapshot = JSON.parse(process.env.T3_PLUGIN_SNAPSHOT ?? '{"channel":{"name":"Creator"},"ideas":[],"projects":[],"publishQueue":[],"sponsors":[]}') as CreatorSnapshot;
const statePath = process.env.T3_PLUGIN_STATE_FILE;
let workflowState: CreatorWorkflowState = {};
if (statePath) {
  try { workflowState = JSON.parse(await Bun.file(statePath).text()).workflowState ?? {}; } catch { /* Safe empty state. */ }
}
const commandPrefix = process.env.T3_PLUGIN_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
const publishPrefix = process.env.T3_PLUGIN_PUBLISH_COMMAND?.trim().split(/\s+/u).filter(Boolean) ?? [];
const run = async (prefix: readonly string[], args: readonly string[]) => {
  const child = Bun.spawn([...prefix, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(stderr.trim() || `Creator command exited with ${exitCode}`);
  return JSON.parse(stdout);
};
const workspaceId = process.env.T3_PLUGIN_WORKSPACE ?? "default";
const client = commandPrefix.length > 0 ? createCreatorClient({ workspaceId, run: (args) => run(commandPrefix, args) }) : null;
const refresh = async () => { if (client) snapshot = await client.snapshot(); return snapshot; };
const handler = createRpcHandler({
  get snapshot() { return snapshot; }, refresh,
  getWorkflowState: () => workflowState,
  saveWorkflowState: async (next) => { workflowState = next; if (statePath) await Bun.write(statePath, JSON.stringify({ workflowState })); },
  publish: async ({ projectId }) => {
    if (publishPrefix.length === 0) throw new Error("Creator publish command is not configured");
    const result = await run(publishPrefix, ["--project-id", projectId, "--json"]);
    return { status: result?.status === "published" ? "published" as const : "scheduled" as const };
  },
});
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { requestId: string; method: string; payload?: { navigationId?: string; panelId?: string; actionId?: string; workflowId?: string; input?: unknown } };
      void handler(request.method, request.payload).then((result) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ...result })}\n`)).catch((error) => process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : "Creator plugin request failed" })}\n`));
    } catch (error) { process.stdout.write(`${JSON.stringify({ type: "plugin.response", requestId: "unknown", ok: false, error: error instanceof Error ? error.message : "invalid request" })}\n`); }
  }
});
