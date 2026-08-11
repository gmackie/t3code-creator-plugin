import { buildCreatorWorkflow, buildSurfaceModel, type CreatorSnapshot, type CreatorWorkflowState } from "./creator.ts";

export function createRpcHandler(coordinator: {
  snapshot: CreatorSnapshot | null;
  refresh(): Promise<CreatorSnapshot>;
  getWorkflowState?: () => CreatorWorkflowState;
  saveWorkflowState?: (state: CreatorWorkflowState) => Promise<void>;
  publish?: (input: { projectId: string }) => Promise<{ status: "scheduled" | "published" }>;
}) {
  let state: CreatorWorkflowState = {};
  const currentState = () => coordinator.getWorkflowState?.() ?? state;
  const saveState = async (next: CreatorWorkflowState) => { state = next; await coordinator.saveWorkflowState?.(next); };
  return async (method: string, payload?: { navigationId?: string; panelId?: string; actionId?: string; workflowId?: string; input?: unknown }) => {
    const snapshot = coordinator.snapshot ?? (await coordinator.refresh());
    if (method === "surface.get") return { ok: true as const, result: buildSurfaceModel(snapshot, payload?.navigationId) };
    if (method === "workflow.get" && payload?.workflowId === "creator.video-readiness") return { ok: true as const, result: buildCreatorWorkflow(snapshot, currentState()) };
    if (method === "panel.get" && payload?.panelId === "creator.command-center") return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.command-center", title: "Creator command center", kind: "command-center" as const, refreshedAt: new Date().toISOString(), content: { kind: "command-center" as const, surface: buildSurfaceModel(snapshot) } } };
    if (method === "action.execute" && payload?.workflowId === "creator.video-readiness") {
      const existing = currentState();
      if (payload.actionId === "approve") { await saveState({ ...existing, approved: true }); return { ok: true as const, result: { status: "approved" as const } }; }
      if (payload.actionId === "publish") {
        if (!existing.approved) return { ok: false as const, error: "Approve the creator package before publishing" };
        if (!coordinator.publish) return { ok: false as const, error: "Creator publish callback is unavailable" };
        const projectId = ((payload.input ?? {}) as { projectId?: string }).projectId ?? snapshot.projects[0]?.id;
        if (!projectId) return { ok: false as const, error: "Select a project before publishing" };
        const result = await coordinator.publish({ projectId });
        await saveState({ ...existing, approved: true, published: true });
        return { ok: true as const, result };
      }
    }
    return { ok: false as const, error: `unsupported Creator RPC method: ${method}` };
  };
}
