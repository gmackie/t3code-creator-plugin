import { describe, expect, test } from "bun:test";
import { createRpcHandler } from "./rpc.ts";

const snapshot = { channel: { name: "GMACKO" }, ideas: [{ id: "idea-1", title: "Next", rung: "package" as const }], projects: [{ id: "video-1", title: "Next", status: "editing", format: "long" as const }], publishQueue: [], sponsors: [] };

describe("Creator RPC", () => {
  test("serves the command-center panel and readiness workflow", async () => {
    const handler = createRpcHandler({ snapshot, refresh: async () => snapshot });
    await expect(handler("panel.get", { panelId: "creator.command-center" })).resolves.toMatchObject({ ok: true, result: { panelId: "creator.command-center", content: { kind: "command-center" } } });
    await expect(handler("workflow.get", { workflowId: "creator.video-readiness" })).resolves.toMatchObject({ ok: true, result: { workflowId: "creator.video-readiness" } });
  });

  test("requires explicit approval before invoking publish", async () => {
    let approved = false;
    let published = false;
    const handler = createRpcHandler({ snapshot, refresh: async () => snapshot, getWorkflowState: () => ({ approved }), saveWorkflowState: async (state) => { approved = state.approved === true; }, publish: async () => { published = true; return { status: "scheduled" as const }; } });
    await expect(handler("action.execute", { actionId: "publish", workflowId: "creator.video-readiness" })).resolves.toMatchObject({ ok: false });
    await expect(handler("action.execute", { actionId: "approve", workflowId: "creator.video-readiness" })).resolves.toMatchObject({ ok: true, result: { status: "approved" } });
    await expect(handler("action.execute", { actionId: "publish", workflowId: "creator.video-readiness", input: { projectId: "video-1" } })).resolves.toMatchObject({ ok: true, result: { status: "scheduled" } });
    expect(published).toBe(true);
  });
});
