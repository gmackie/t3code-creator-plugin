import { buildAnalyticsDiagnosis, buildCreatorWorkflow, buildIdeaLadderModel, buildPackageChecklist, buildSurfaceModel, type CreatorSnapshot, type CreatorWorkflowState } from "./creator.ts";

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
    if (method === "panel.get" && payload?.panelId === "creator.publish-queue") return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.publish-queue", title: "Publish queue", kind: "publish-queue" as const, refreshedAt: new Date().toISOString(), content: { kind: "publish-queue" as const, items: snapshot.publishQueue } } };
    if (method === "panel.get" && payload?.panelId === "creator.content-calendar") return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.content-calendar", title: "Content calendar", kind: "content-calendar" as const, refreshedAt: new Date().toISOString(), content: { kind: "content-calendar" as const, slots: snapshot.calendar } } };
    if (method === "panel.get" && payload?.panelId === "creator.analytics") return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.analytics", title: "Creator analytics", kind: "analytics" as const, refreshedAt: new Date().toISOString(), content: { kind: "analytics" as const, metrics: snapshot.analytics ?? { ctr: null }, diagnosis: buildAnalyticsDiagnosis(snapshot.analytics) } } };
    if (method === "panel.get" && payload?.panelId === "creator.idea-ladder") { const stages = buildIdeaLadderModel(snapshot); return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.idea-ladder", title: "Idea ladder", kind: "idea-ladder" as const, refreshedAt: new Date().toISOString(), content: { kind: "idea-ladder" as const, stages } } }; }
    if (method === "panel.get" && payload?.panelId === "creator.package-review") { const projectId = ((payload.input ?? {}) as { projectId?: string }).projectId ?? snapshot.projects[0]?.id; return { ok: true as const, result: { pluginId: "com.t3code.creator", panelId: "creator.package-review", title: "Package review", kind: "package-review" as const, refreshedAt: new Date().toISOString(), content: { kind: "package-review" as const, projectId, projectTitle: snapshot.projects.find((project) => project.id === projectId)?.title ?? "Select a project", checks: buildPackageChecklist(snapshot, projectId) } } }; }
    if (method === "action.execute" && payload?.workflowId === "creator.video-readiness") {
      const existing = currentState();
      if (payload.actionId === "approve") { const projectId = ((payload.input ?? {}) as { projectId?: string }).projectId; await saveState({ ...existing, ...(projectId ? { projectId } : {}), approved: true }); return { ok: true as const, result: { status: "approved" as const } }; }
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
