// Test fixtures shared by the MCP server, controller and view-bridge tests.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createCommandRunner } from "./commands.ts";
import { createCreatorClient } from "./creator.ts";
import { createCreatorMcpServer } from "./server.ts";
import { memoryStateStore, type CreatorStateStore } from "./state.ts";

export const FAKE_CREATOR = ["bun", new URL("../scripts/fake-creator.ts", import.meta.url).pathname];

// Drives the real command runner against scripts/fake-creator.ts, so tests
// cover spawning, JSON parsing and error mapping, not just the domain code.
export async function connectedClient(options: { command?: readonly string[]; publishCommand?: readonly string[]; state?: CreatorStateStore; timeoutMs?: number } = {}) {
  const runner = (prefix: readonly string[], label: string, setting: string) => createCommandRunner(prefix, { label, setting, ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) });
  const creator = createCreatorClient({ workspaceId: "ws-1", run: runner(options.command ?? FAKE_CREATOR, "Creator command", "CREATOR_COMMAND") });
  const publishRunner = runner(options.publishCommand ?? FAKE_CREATOR, "Creator publish command", "CREATOR_PUBLISH_COMMAND");
  const published: string[] = [];
  const server = createCreatorMcpServer({
    snapshot: (projectId) => creator.snapshot(projectId),
    publish: async (projectId) => {
      const result = await publishRunner(["--project-id", projectId, "--json"]);
      published.push(projectId);
      return result;
    },
    state: options.state ?? memoryStateStore(),
    pollSeconds: 30,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server, published };
}

export type Structured<T> = { structuredContent?: T; isError?: boolean; content: { type: string; text?: string }[] };

export const call = async <T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as unknown as Structured<T>;
