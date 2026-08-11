import { describe, expect, test } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

const snapshot = { channel: { name: "GMACKO" }, ideas: [{ id: "idea-1", title: "Next", rung: "package" as const }], projects: [{ id: "video-1", title: "Next", status: "editing", format: "long" as const }], publishQueue: [], calendar: [], sponsors: [] };

describe("Creator RPC", () => {
  test("serves the command-center panel and readiness workflow", async () => {
    const handler = createRpcHandler({ snapshot, refresh: async () => snapshot });
    await expect(handler("panel.get", { panelId: "creator.command-center" })).resolves.toMatchObject({ ok: true, result: { panelId: "creator.command-center", content: { kind: "command-center" } } });
    await expect(handler("workflow.get", { workflowId: "creator.video-readiness" })).resolves.toMatchObject({ ok: true, result: { workflowId: "creator.video-readiness" } });
  });

  test("serves publish queue, calendar, and analytics panels", async () => {
    const detailed = { ...snapshot, publishQueue: [{ id: "video-1", title: "Next", status: "ready", publishAt: "2026-08-20" }], calendar: [{ id: "slot-1", projectId: "video-1", title: "Next", platform: "youtube", date: "2026-08-20", status: "planned" }], analytics: { ctr: 5.4, views: 12000, averageViewDurationSeconds: 312 } };
    const handler = createRpcHandler({ snapshot: detailed, refresh: async () => detailed });
    await expect(handler("panel.get", { panelId: "creator.publish-queue" })).resolves.toMatchObject({ ok: true, result: { content: { kind: "publish-queue", items: [{ id: "video-1" }] } } });
    await expect(handler("panel.get", { panelId: "creator.content-calendar" })).resolves.toMatchObject({ ok: true, result: { content: { kind: "content-calendar", slots: [{ id: "slot-1" }] } } });
    await expect(handler("panel.get", { panelId: "creator.analytics" })).resolves.toMatchObject({ ok: true, result: { content: { kind: "analytics", metrics: { ctr: 5.4 }, diagnosis: { kind: "healthy" } } } });
  });

  test("serves a project package review room", async () => {
    const detailed = { ...snapshot, projects: [{ id: "video-1", title: "Next", status: "editing", format: "long" as const, package: { titleSelected: true, thumbnailSelected: false } }], sponsors: [{ id: "deal-1", name: "Acme", status: "signed" }] };
    const handler = createRpcHandler({ snapshot: detailed, refresh: async () => detailed });
    await expect(handler("panel.get", { panelId: "creator.package-review", input: { projectId: "video-1" } })).resolves.toMatchObject({ ok: true, result: { content: { kind: "package-review", projectId: "video-1", checks: expect.arrayContaining([expect.objectContaining({ id: "thumbnail", status: "attention" })]) } } });
  });

  test("requires explicit approval before invoking publish", async () => {
    let approved = false;
    let published = false;
    const handler = createRpcHandler({ snapshot, refresh: async () => snapshot, getWorkflowState: () => ({ approved }), saveWorkflowState: async (state) => { approved = state.approved === true; }, publish: async () => { published = true; return { status: "scheduled" as const }; } });
    await expect(handler("action.execute", { actionId: "publish", workflowId: "creator.video-readiness" })).resolves.toMatchObject({ ok: false });
    await expect(handler("action.execute", { actionId: "approve", workflowId: "creator.video-readiness", input: { projectId: "video-1" } })).resolves.toMatchObject({ ok: true, result: { status: "approved" } });
    await expect(handler("action.execute", { actionId: "publish", workflowId: "creator.video-readiness", input: { projectId: "video-1" } })).resolves.toMatchObject({ ok: true, result: { status: "scheduled" } });
    expect(published).toBe(true);
  });
});
