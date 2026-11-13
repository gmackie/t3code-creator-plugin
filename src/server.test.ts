import { describe, expect, it } from "bun:test";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileStateStore } from "./state.ts";
import { FAKE_CREATOR, call, connectedClient } from "./testing.ts";
import type { VideoReadinessData, ViewData } from "./views/render.ts";

const VIEW_TOOLS = [
  "creator_analytics",
  "creator_command_center",
  "creator_content_calendar",
  "creator_idea_ladder",
  "creator_package_review",
  "creator_publish_queue",
  "creator_sponsor_deal_room",
  "creator_video_publish",
  "creator_video_readiness",
];

describe("Creator MCP server", () => {
  it("links view tools to ui:// views and hides approval from the model", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect([...byName.keys()].sort()).toEqual([...VIEW_TOOLS, "creator_video_approve"].sort());
    expect(byName.get("creator_command_center")?._meta).toMatchObject({ ui: { resourceUri: "ui://creator/command-center.html", visibility: ["model", "app"] } });
    expect(byName.get("creator_video_publish")?._meta).toMatchObject({ ui: { resourceUri: "ui://creator/video-readiness.html" } });
    expect(byName.get("creator_video_approve")?._meta).toEqual({ ui: { visibility: ["app"] } });
    for (const name of VIEW_TOOLS) expect((byName.get(name)?._meta as { ui: { visibility: string[] } }).ui.visibility).toEqual(["model", "app"]);
    expect(byName.get("creator_analytics")?.annotations?.readOnlyHint).toBe(true);
  });

  it("serves each view as a self-contained MCP App resource", async () => {
    const { client } = await connectedClient();
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(8);
    for (const resource of resources) {
      expect(resource.mimeType).toBe(RESOURCE_MIME_TYPE);
      const { contents } = await client.readResource({ uri: resource.uri });
      const html = (contents[0] as { text: string }).text;
      expect(html).toStartWith("<!doctype html>");
      expect(html).toContain("ui/initialize");
      // T3's sandbox CSP is default-src 'none': nothing may load from outside.
      expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
      expect(html.length).toBeLessThan(100_000);
    }
  });

  it("returns the command center from the Creator command with a text summary for agents", async () => {
    const { client } = await connectedClient();
    const result = await call<Extract<ViewData, { kind: "command-center" }>>(client, "creator_command_center");
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ kind: "command-center", channel: "GMACKO", pollSeconds: 30 });
    expect(result.structuredContent?.nextActions.map((action) => action.id)).toEqual(["package:video-1", "publish:video-2", "sponsor:deal-1", "calendar:slot-1", "idea:idea-1"]);
    expect(result.content[0]?.text).toContain("[now] Finish package for Build log #12");
  });

  it("serves every panel tool from the same snapshot", async () => {
    const { client } = await connectedClient();
    expect((await call(client, "creator_publish_queue")).structuredContent).toMatchObject({ kind: "publish-queue", items: [{ id: "video-2", status: "ready" }] });
    expect((await call(client, "creator_content_calendar", { projectId: "video-2" })).structuredContent).toMatchObject({ kind: "content-calendar", slots: [{ projectId: "video-2" }] });
    expect((await call(client, "creator_analytics")).structuredContent).toMatchObject({ kind: "analytics", metrics: { ctr: 3.1 }, diagnosis: { kind: "packaging" } });
    expect((await call(client, "creator_idea_ladder")).structuredContent).toMatchObject({ kind: "idea-ladder", stages: [{ rung: "spark", count: 1 }, { rung: "proof", count: 0 }, { rung: "package", count: 1 }, {}, {}] });
    expect((await call(client, "creator_sponsor_deal_room")).structuredContent).toMatchObject({ kind: "sponsor-deal-room", totals: { active: 2, needsDisclosure: 1, delivered: 1 } });
    const review = await call<Extract<ViewData, { kind: "package-review" }>>(client, "creator_package_review", { projectId: "video-1" });
    expect(review.structuredContent).toMatchObject({ projectId: "video-1", projectTitle: "Build log #12" });
    expect(review.structuredContent?.checks.find((check) => check.id === "thumbnail")?.status).toBe("attention");
    expect((await call(client, "creator_package_review", { projectId: "missing" })).isError).toBe(true);
  });

  it("requires human approval, then publishes through the publish command", async () => {
    const { client, published } = await connectedClient();
    const before = await call<VideoReadinessData>(client, "creator_video_readiness", { projectId: "video-2" });
    expect(before.structuredContent?.workflow.actions?.map((action) => action.id)).toEqual(["approve"]);

    const refused = await call(client, "creator_video_publish", { projectId: "video-2" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("Approve the creator package");
    expect(published).toEqual([]);

    expect((await call(client, "creator_video_approve", { projectId: "video-2" })).structuredContent).toEqual({ projectId: "video-2", approved: true });
    const done = await call<VideoReadinessData>(client, "creator_video_publish", { projectId: "video-2" });
    expect(done.isError).toBeFalsy();
    expect(done.structuredContent).toMatchObject({ kind: "video-readiness", projectId: "video-2", published: { status: "scheduled", publishAt: "2026-11-20T17:00:00.000Z" }, workflow: { currentStage: "verify", actions: [] } });
    expect(published).toEqual(["video-2"]);
    expect((await call(client, "creator_video_publish", { projectId: "video-2" })).content[0]?.text).toContain("already published");
  });

  it("shares approval between plugin copies through the state file", async () => {
    // T3 runs one stdio copy per agent session plus one in its pool: a panel
    // approves in one process and the agent publishes from another.
    const path = join(tmpdir(), `creator-state-${crypto.randomUUID()}`, "state.json");
    const pool = await connectedClient({ state: fileStateStore(path) });
    const session = await connectedClient({ state: fileStateStore(path) });
    await call(pool.client, "creator_video_approve", { projectId: "video-1" });
    expect((await call(session.client, "creator_video_publish", { projectId: "video-1" })).isError).toBeFalsy();
    expect(session.published).toEqual(["video-1"]);
  });

  it("refuses to approve an unknown project", async () => {
    const { client } = await connectedClient();
    const result = await call(client, "creator_video_approve", { projectId: "nope" });
    expect(result).toMatchObject({ isError: true, content: [{ text: "Creator project nope was not found." }] });
  });

  describe("missing configuration", () => {
    it("explains how to connect Creator instead of returning empty data", async () => {
      const { client } = await connectedClient({ command: [] });
      const result = await call(client, "creator_command_center");
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(result.content[0]?.text).toBe("Creator command is not configured: set CREATOR_COMMAND in the plugin settings.");
    });

    it("never claims a publish without a publish command", async () => {
      const { client, published } = await connectedClient({ publishCommand: [] });
      await call(client, "creator_video_approve", { projectId: "video-1" });
      const result = await call(client, "creator_video_publish", { projectId: "video-1" });
      expect(result).toMatchObject({ isError: true, content: [{ text: "Creator publish command is not configured: set CREATOR_PUBLISH_COMMAND in the plugin settings." }] });
      expect(published).toEqual([]);
      // Still approved and unpublished, so the human can retry once it is set.
      expect((await call<VideoReadinessData>(client, "creator_video_readiness", { projectId: "video-1" })).structuredContent?.workflow.actions?.[0]?.id).toBe("publish");
    });
  });

  describe("upstream failures", () => {
    it("reports a failing Creator command briefly, without URLs or stack traces", async () => {
      const { client } = await connectedClient({ command: [...FAKE_CREATOR, "--mode", "fail"] });
      const result = await call(client, "creator_publish_queue");
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe("Creator command failed (exit 1): Creator API <url> returned 502");
    });

    it("rejects output that is not JSON", async () => {
      const { client } = await connectedClient({ command: [...FAKE_CREATOR, "--mode", "garbage"] });
      expect((await call(client, "creator_analytics")).content[0]?.text).toBe("Creator command did not return JSON.");
    });

    it("times out a hung Creator command", async () => {
      const { client } = await connectedClient({ command: [...FAKE_CREATOR, "--mode", "hang"], timeoutMs: 300 });
      expect((await call(client, "creator_idea_ladder")).content[0]?.text).toBe("Creator command timed out after 1s.");
    });

    it("keeps approval when publishing fails", async () => {
      const { client } = await connectedClient({ publishCommand: [...FAKE_CREATOR, "--mode", "fail"] });
      await call(client, "creator_video_approve", { projectId: "video-1" });
      expect((await call(client, "creator_video_publish", { projectId: "video-1" })).content[0]?.text).toContain("Creator publish command failed (exit 1)");
      expect((await call<VideoReadinessData>(client, "creator_video_readiness", { projectId: "video-1" })).structuredContent?.workflow.currentStage).toBe("execute");
    });

    it("does not treat an unconfirmed publish status as success", async () => {
      const { client } = await connectedClient({ publishCommand: [...FAKE_CREATOR, "--mode", "unconfirmed"] });
      await call(client, "creator_video_approve", { projectId: "video-1" });
      expect((await call(client, "creator_video_publish", { projectId: "video-1" })).content[0]?.text).toBe("Creator publish command did not confirm a published or scheduled status.");
    });
  });
});
