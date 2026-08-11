export type CreatorIdea = { id: string; title: string; rung: "spark" | "proof" | "package" | "production" | "publish" | "unknown" };
export type CreatorPackageReadiness = { titleSelected?: boolean; thumbnailSelected?: boolean; hookReady?: boolean; captionsReady?: boolean; disclosureReady?: boolean };
export type CreatorProject = { id: string; title: string; status: string; format: "long" | "short" | "stream" | "unknown"; package?: CreatorPackageReadiness };
export type CreatorPublishItem = { id: string; title: string; status: string; publishAt?: string };
export type CreatorCalendarSlot = { id: string; projectId?: string; title: string; platform: string; date: string; status: string };
export type CreatorSponsor = { id: string; name: string; status: string; disclosure?: string };
export type CreatorSnapshot = { channel: { name: string; subscribers?: number }; ideas: readonly CreatorIdea[]; projects: readonly CreatorProject[]; publishQueue: readonly CreatorPublishItem[]; calendar: readonly CreatorCalendarSlot[]; analytics?: { ctr: number | null; views?: number; averageViewDurationSeconds?: number }; sponsors: readonly CreatorSponsor[] };
export type CreatorNextAction = { id: string; title: string; reason: string; priority: "now" | "next" | "later"; navigationId: string; projectId?: string };
export type CreatorPackageCheck = { id: "title" | "thumbnail" | "hook" | "captions" | "disclosure"; label: string; status: "complete" | "attention" | "not-configured" | "not-applicable"; reason: string; navigationId: string };
export type CreatorAnalyticsDiagnosis = { kind: "packaging" | "retention" | "reach" | "healthy" | "needs-data"; title: string; reason: string; nextAction: string; navigationId: string };
export type CreatorIdeaLadderStage = { rung: Exclude<CreatorIdea["rung"], "unknown">; title: string; count: number; items: readonly { id: string; title: string; nextAction: string }[] };
export type CreatorSponsorDeal = { id: string; name: string; status: string; disclosure?: string; needsDisclosure: boolean; nextAction: string };
export type CreatorSponsorDealRoom = { totals: { active: number; needsDisclosure: number; delivered: number }; deals: readonly CreatorSponsorDeal[] };
export type SurfaceCard = { kind: "metric" | "list" | "notice"; id: string; title: string; value?: string; message?: string; items?: readonly { id: string; title: string; detail?: string; status?: "neutral" | "positive" | "warning" | "negative" }[]; status?: "neutral" | "positive" | "warning" | "negative" };
export type SurfaceModel = { pluginId: string; navigationId: string; title: string; refreshedAt: string; cards: readonly SurfaceCard[] };
export type CreatorWorkflowState = { readonly projectId?: string; readonly approved?: boolean; readonly published?: boolean; };
export type CreatorWorkflowModel = { readonly pluginId: string; readonly workflowId: string; readonly title: string; readonly currentStage: "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond"; readonly refreshedAt: string; readonly steps: readonly { id: string; stage: CreatorWorkflowModel["currentStage"]; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[]; readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string }[]; readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[] };
export type CommandRunner = (command: readonly string[]) => Promise<unknown>;

function rung(value: unknown): CreatorIdea["rung"] { return ["spark", "proof", "package", "production", "publish"].includes(String(value)) ? value as CreatorIdea["rung"] : "unknown"; }
function format(value: unknown): CreatorProject["format"] { return ["long", "short", "stream"].includes(String(value)) ? value as CreatorProject["format"] : "unknown"; }
function packageReadiness(value: any): CreatorPackageReadiness | undefined { if (!value || typeof value !== "object") return undefined; const keys = ["titleSelected", "thumbnailSelected", "hookReady", "captionsReady", "disclosureReady"] as const; const result = Object.fromEntries(keys.filter((key) => typeof value[key] === "boolean").map((key) => [key, value[key]])) as CreatorPackageReadiness; return Object.keys(result).length > 0 ? result : undefined; }
export function normalizeCreatorSnapshot(value: any): CreatorSnapshot {
  return {
    channel: { name: String(value?.channel?.name ?? value?.channelName ?? "Creator"), ...(typeof value?.channel?.subscribers === "number" ? { subscribers: value.channel.subscribers } : {}) },
    ideas: Array.isArray(value?.ideas) ? value.ideas.map((idea: any) => ({ id: String(idea.id), title: String(idea.title ?? idea.name ?? idea.id), rung: rung(idea.rung ?? idea.stage) })) : [],
    projects: Array.isArray(value?.projects) ? value.projects.map((project: any) => ({ id: String(project.id), title: String(project.title ?? project.name ?? project.id), status: String(project.status ?? "unknown"), format: format(project.format), ...(packageReadiness(project.package ?? project.packageReadiness) ? { package: packageReadiness(project.package ?? project.packageReadiness) } : {}) })) : [],
    publishQueue: Array.isArray(value?.publishQueue) ? value.publishQueue.map((item: any) => ({ id: String(item.id), title: String(item.title ?? item.name ?? item.id), status: String(item.status ?? "unknown"), ...(typeof item.publishAt === "string" ? { publishAt: item.publishAt } : {}) })) : [],
    calendar: Array.isArray(value?.calendar ?? value?.contentCalendar) ? (value.calendar ?? value.contentCalendar).map((slot: any) => ({ id: String(slot.id), ...(slot.projectId ? { projectId: String(slot.projectId) } : {}), title: String(slot.title ?? slot.name ?? slot.id), platform: String(slot.platform ?? "youtube"), date: String(slot.date ?? slot.scheduledAt ?? ""), status: String(slot.status ?? "planned") })) : [],
    analytics: value?.analytics ? { ctr: typeof value.analytics.ctr === "number" ? value.analytics.ctr : null, ...(typeof value.analytics.views === "number" ? { views: value.analytics.views } : {}), ...(typeof value.analytics.averageViewDurationSeconds === "number" ? { averageViewDurationSeconds: value.analytics.averageViewDurationSeconds } : {}) } : undefined,
    sponsors: Array.isArray(value?.sponsors) ? value.sponsors.map((sponsor: any) => ({ id: String(sponsor.id), name: String(sponsor.name ?? sponsor.id), status: String(sponsor.status ?? "unknown"), ...(typeof sponsor.disclosure === "string" ? { disclosure: sponsor.disclosure } : {}) })) : [],
  };
}

export function buildNextActions(snapshot: CreatorSnapshot): readonly CreatorNextAction[] {
  const actions: CreatorNextAction[] = [];
  for (const project of snapshot.projects) {
    const missing = project.package && Object.entries(project.package).find(([, ready]) => ready === false)?.[0];
    if (missing) {
      const labels: Record<string, string> = { titleSelected: "choose a title", thumbnailSelected: "choose a thumbnail", hookReady: "finish the opening hook", captionsReady: "finish captions", disclosureReady: "add sponsor disclosure" };
      actions.push({ id: `package:${project.id}`, title: `Finish package for ${project.title}`, reason: `Next: ${labels[missing] ?? missing}`, priority: "now", navigationId: "creator.production", projectId: project.id });
    }
  }
  for (const item of snapshot.publishQueue.filter((item) => ["ready", "scheduled"].includes(item.status))) actions.push({ id: `publish:${item.id}`, title: `${item.status === "scheduled" ? "Check" : "Publish"} ${item.title}`, reason: item.publishAt ? `Scheduled ${item.publishAt}` : "Ready for explicit publish review", priority: "now", navigationId: "creator.publishing", projectId: item.id });
  for (const sponsor of snapshot.sponsors.filter((sponsor) => ["signed", "in_production", "delivered"].includes(sponsor.status) && !sponsor.disclosure?.trim())) actions.push({ id: `sponsor:${sponsor.id}`, title: `Add disclosure for ${sponsor.name}`, reason: "A signed sponsor deal needs disclosure before publishing", priority: "now", navigationId: "creator.sponsors" });
  for (const slot of snapshot.calendar.filter((slot) => slot.status === "planned").slice(0, 2)) actions.push({ id: `calendar:${slot.id}`, title: `Review ${slot.title} calendar slot`, reason: `${slot.platform} · ${slot.date}`, priority: "next", navigationId: "creator.publishing", projectId: slot.projectId });
  for (const idea of snapshot.ideas.filter((idea) => ["spark", "proof"].includes(idea.rung)).slice(0, 2)) actions.push({ id: `idea:${idea.id}`, title: `Advance ${idea.title}`, reason: `${idea.rung} → package`, priority: "later", navigationId: "creator.ideas" });
  return actions.slice(0, 8);
}

export function buildPackageChecklist(snapshot: CreatorSnapshot, projectId?: string): readonly CreatorPackageCheck[] {
  const project = snapshot.projects.find((candidate) => candidate.id === projectId) ?? snapshot.projects[0];
  const packageState = project?.package;
  const check = (id: CreatorPackageCheck["id"], label: string, value: boolean | undefined, reason: string, navigationId: string): CreatorPackageCheck => ({ id, label, status: value === true ? "complete" : value === false ? "attention" : "not-configured", reason, navigationId });
  const sponsored = snapshot.sponsors.some((sponsor) => ["signed", "in_production", "delivered"].includes(sponsor.status));
  const disclosure = packageState?.disclosureReady ?? (sponsored ? (snapshot.sponsors.filter((sponsor) => ["signed", "in_production", "delivered"].includes(sponsor.status)).every((sponsor) => Boolean(sponsor.disclosure?.trim())) ? true : false) : undefined);
  return [
    check("title", "Title", packageState?.titleSelected, packageState?.titleSelected ? "A title is selected" : "Choose one title before publish review", "creator.production"),
    check("thumbnail", "Thumbnail", packageState?.thumbnailSelected, packageState?.thumbnailSelected ? "A thumbnail is selected" : "Choose a thumbnail or confirm an A/B winner", "creator.production"),
    check("hook", "Opening hook", packageState?.hookReady, packageState?.hookReady ? "Opening hook is marked ready" : "Review the first 15–30 seconds", "creator.production"),
    check("captions", "Captions and SEO", packageState?.captionsReady, packageState?.captionsReady ? "Captions and SEO are marked ready" : "Finish captions and metadata review", "creator.publishing"),
    { id: "disclosure", label: "Sponsor disclosure", status: disclosure === undefined ? "not-applicable" : disclosure ? "complete" : "attention", reason: disclosure === undefined ? "No active sponsor disclosure gate" : disclosure ? "Disclosure is ready" : "Add the sponsor disclosure before public publishing", navigationId: "creator.sponsors" },
  ];
}

export function buildAnalyticsDiagnosis(analytics: CreatorSnapshot["analytics"]): CreatorAnalyticsDiagnosis {
  if (!analytics || analytics.ctr === null || analytics.averageViewDurationSeconds === undefined) return { kind: "needs-data", title: "More audience data needed", reason: "CTR and average view duration are both needed for a useful directional read.", nextAction: "Connect or refresh YouTube analytics", navigationId: "creator.analytics" };
  if (analytics.ctr < 4 && analytics.averageViewDurationSeconds >= 240) return { kind: "packaging", title: "Packaging is the likely bottleneck", reason: "Viewers who click are watching; the title or thumbnail may be limiting the click-through rate.", nextAction: "Review title and thumbnail", navigationId: "creator.production" };
  if (analytics.ctr >= 4 && analytics.averageViewDurationSeconds < 180) return { kind: "retention", title: "The opening is the likely bottleneck", reason: "The package earns clicks, but viewers are leaving early.", nextAction: "Review the first 30 seconds", navigationId: "creator.production" };
  if (analytics.ctr < 4 && analytics.averageViewDurationSeconds < 240) return { kind: "reach", title: "Both packaging and retention need attention", reason: "This is a directional signal, not a verdict; improve the package and opening together.", nextAction: "Review package, then opening hook", navigationId: "creator.production" };
  return { kind: "healthy", title: "No urgent bottleneck detected", reason: "CTR and average view duration are within the directional healthy range.", nextAction: "Capture the learning and test the next package", navigationId: "creator.ideas" };
}

export function buildIdeaLadderModel(snapshot: CreatorSnapshot): readonly CreatorIdeaLadderStage[] {
  const stages = [
    { rung: "spark", title: "Sparks", nextAction: "Add proof" },
    { rung: "proof", title: "Proof", nextAction: "Shape a package" },
    { rung: "package", title: "Packages", nextAction: "Start production" },
    { rung: "production", title: "In production", nextAction: "Prepare publish" },
    { rung: "publish", title: "Ready to publish", nextAction: "Run publish checks" },
  ] as const;
  return stages.map((stage) => {
    const items = snapshot.ideas.filter((idea) => idea.rung === stage.rung);
    return {
      rung: stage.rung,
      title: stage.title,
      count: items.length,
      items: items.slice(0, 8).map((idea) => ({ id: idea.id, title: idea.title, nextAction: stage.nextAction })),
    };
  });
}

export function buildSponsorDealRoomModel(snapshot: CreatorSnapshot): CreatorSponsorDealRoom {
  const activeStatuses = ["signed", "in_production", "delivered"];
  const active = snapshot.sponsors.filter((sponsor) => activeStatuses.includes(sponsor.status));
  const deals = active.map((sponsor) => {
    const needsDisclosure = !sponsor.disclosure?.trim();
    return {
      id: sponsor.id,
      name: sponsor.name,
      status: sponsor.status,
      ...(sponsor.disclosure ? { disclosure: sponsor.disclosure } : {}),
      needsDisclosure,
      nextAction: needsDisclosure ? "Add disclosure" : sponsor.status === "delivered" ? "Verify delivery" : "Track deliverable",
    };
  });
  return {
    totals: {
      active: active.length,
      needsDisclosure: deals.filter((deal) => deal.needsDisclosure).length,
      delivered: active.filter((sponsor) => sponsor.status === "delivered").length,
    },
    deals,
  };
}

export function buildSurfaceModel(snapshot: CreatorSnapshot, navigationId = "creator.command-center"): SurfaceModel {
  return { pluginId: "com.t3code.creator", navigationId, title: "Creator command center", refreshedAt: new Date().toISOString(), cards: [
    { kind: "metric", id: "ideas", title: "Ideas in ladder", value: `${snapshot.ideas.length}`, status: snapshot.ideas.length > 0 ? "positive" : "warning" },
    { kind: "metric", id: "in-production", title: "In production", value: `${snapshot.projects.filter((project) => !["published", "archived"].includes(project.status)).length}` },
    { kind: "metric", id: "publish-queue", title: "Publish queue", value: `${snapshot.publishQueue.length}`, status: snapshot.publishQueue.length > 0 ? "positive" : "warning" },
    { kind: "metric", id: "calendar", title: "Upcoming calendar slots", value: `${snapshot.calendar.length}`, status: snapshot.calendar.length > 0 ? "positive" : "warning" },
    { kind: "list", id: "next-actions", title: "Your next best actions", items: buildNextActions(snapshot).map((action) => ({ id: action.id, title: action.title, detail: `${action.reason} · ${action.navigationId}`, status: action.priority === "now" ? "warning" as const : action.priority === "next" ? "neutral" as const : "positive" as const })) },
    { kind: "notice", id: "human-in-loop", title: "Human review stays in control", message: "Creator prepares packages, drafts, and publish checks; final editorial and publishing decisions remain explicit." },
  ] };
}

export function buildCreatorWorkflow(snapshot: CreatorSnapshot, state: CreatorWorkflowState = {}): CreatorWorkflowModel {
  const project = snapshot.projects.find((candidate) => candidate.id === state.projectId) ?? snapshot.projects[0];
  const packageReady = Boolean(project?.package && Object.values(project.package).every((value) => value !== false));
  const ready = Boolean(project && (packageReady || snapshot.publishQueue.some((item) => item.id === project.id && ["ready", "scheduled"].includes(item.status))));
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect creator pipeline", state: "completed" as const, detail: `${snapshot.ideas.length} ideas · ${snapshot.projects.length} projects` },
    { id: "context", stage: "context" as const, title: "Collect channel and audience context", state: "completed" as const, detail: snapshot.analytics?.views === undefined ? "No analytics supplied" : `${snapshot.analytics.views} views` },
    { id: "propose", stage: "propose" as const, title: "Prepare title, thumbnail, and platform package", state: packageReady ? "completed" as const : "active" as const, detail: project?.package ? `${Object.values(project.package).filter(Boolean).length}/${Object.keys(project.package).length} package checks complete` : "No package checks supplied" },
    { id: "review", stage: "review" as const, title: "Review creator package", state: state.approved ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve package for publishing", state: state.approved ? "completed" as const : "pending" as const },
    { id: "execute", stage: "execute" as const, title: "Publish or schedule video", state: state.published ? "completed" as const : state.approved ? "active" as const : "pending" as const },
    { id: "verify", stage: "verify" as const, title: "Verify publish and distribution checks", state: state.published ? "completed" as const : "pending" as const, detail: ready ? "Publish queue is ready" : "Title, thumbnail, or publish readiness needs review" },
    { id: "respond", stage: "respond" as const, title: "Capture audience learning", state: "pending" as const },
  ];
  return { pluginId: "com.t3code.creator", workflowId: "creator.video-readiness", title: "Video readiness review", currentStage: state.published ? "verify" : state.approved ? "execute" : "review", refreshedAt: new Date().toISOString(), steps, evidence: [{ id: "package-readiness", title: "Package readiness", kind: "check", status: ready ? "positive" : "warning", detail: ready ? `${project?.title ?? "Project"} is ready for publishing` : `Package checks for ${project?.title ?? "the active project"} need attention` }], actions: state.published ? [] : state.approved ? [{ id: "publish", title: "Publish or schedule video", tone: "primary" }] : [{ id: "approve", title: "Approve creator package", tone: "primary" }] };
}

export function createCreatorClient(input: { workspaceId: string; run: CommandRunner }) { return { async snapshot() { return normalizeCreatorSnapshot(await input.run(["video_creator_snapshot", "--workspace", input.workspaceId, "--json"])); } }; }
