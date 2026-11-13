// Pure HTML renderers shared by the ui:// views (bundled into the browser) and
// the tests. All dynamic text goes through esc().
import type {
  CreatorAnalyticsDiagnosis,
  CreatorCalendarSlot,
  CreatorIdeaLadderStage,
  CreatorNextAction,
  CreatorPackageCheck,
  CreatorPublishItem,
  CreatorSnapshot,
  CreatorSponsorDealRoom,
  CreatorWorkflowModel,
  SurfaceModel,
} from "../creator.ts";

type Base = { channel: string; refreshedAt: string; pollSeconds: number };
export type ProjectOption = { id: string; title: string; status: string };

export type VideoReadinessData = Base & {
  kind: "video-readiness";
  projects: readonly ProjectOption[];
  workflow: CreatorWorkflowModel;
  projectId?: string;
  projectTitle?: string;
  published?: { status: "published" | "scheduled"; publishAt?: string };
};

export type ViewData =
  | (Base & { kind: "command-center"; surface: SurfaceModel; nextActions: readonly CreatorNextAction[] })
  | (Base & { kind: "publish-queue"; items: readonly CreatorPublishItem[] })
  | (Base & { kind: "content-calendar"; slots: readonly CreatorCalendarSlot[] })
  | (Base & { kind: "analytics"; metrics: NonNullable<CreatorSnapshot["analytics"]>; diagnosis: CreatorAnalyticsDiagnosis })
  | (Base & { kind: "idea-ladder"; stages: readonly CreatorIdeaLadderStage[] })
  | (Base & { kind: "sponsor-deal-room" } & CreatorSponsorDealRoom)
  | (Base & { kind: "package-review"; projects: readonly ProjectOption[]; checks: readonly CreatorPackageCheck[]; projectId?: string; projectTitle?: string })
  | VideoReadinessData;

export type ViewKind = ViewData["kind"];

// Where a v1 navigation id now lives: the panel a user opens for it.
const DESTINATIONS: Record<string, string> = {
  "creator.command-center": "Command center",
  "creator.ideas": "Idea ladder",
  "creator.production": "Package review",
  "creator.publishing": "Publish queue",
  "creator.analytics": "Analytics",
  "creator.sponsors": "Sponsor deal room",
};

export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");
const pill = (label: string, tone: string) => `<span class="pill pill-${esc(tone)}">${esc(label)}</span>`;
const empty = (text: string) => `<li class="empty">${esc(text)}</li>`;
const statusTone = (status: string) =>
  ["ready", "published", "delivered", "complete", "positive", "done"].includes(status)
    ? "positive"
    : ["scheduled", "in_production", "editing", "active", "signed"].includes(status)
      ? "active"
      : ["attention", "blocked", "warning", "failed", "negative"].includes(status)
        ? "warning"
        : "neutral";

function row(title: string, meta: string[], detail?: string, trailing = ""): string {
  return `<li class="row"><div class="row-main"><div class="row-title">${esc(title)}</div>${meta.length ? `<div class="row-meta">${meta.join("")}</div>` : ""}${detail ? `<div class="row-detail">${esc(detail)}</div>` : ""}</div>${trailing}</li>`;
}

const span = (text: unknown, cls = "") => `<span${cls ? ` class="${cls}"` : ""}>${esc(text)}</span>`;

function header(title: string, data: Base, refreshAction = "refresh"): string {
  return `<header>
  <h1>${esc(title)}</h1>
  <div class="header-meta"><span data-role="status">${esc(data.channel)} · refreshed ${esc(time(data.refreshedAt))}</span><button type="button" data-action="${refreshAction}">Refresh</button></div>
</header>`;
}

function projectPicker(projects: readonly ProjectOption[], selected?: string): string {
  if (projects.length < 2) return "";
  const options = projects.map((project) => `<option value="${esc(project.id)}"${project.id === selected ? " selected" : ""}>${esc(project.title)} (${esc(project.status)})</option>`).join("");
  return `<label class="field">Project <select data-role="project">${options}</select></label>`;
}

export function renderView(data: ViewData, options: { busy?: boolean; error?: string } = {}): string {
  const alert = options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : "";
  switch (data.kind) {
    case "command-center": {
      const metrics = data.surface.cards
        .filter((card) => card.kind === "metric")
        .map((card) => `<div class="metric metric-${esc(card.status ?? "neutral")}"><div class="metric-value">${esc(card.value)}</div><div class="metric-label">${esc(card.title)}</div></div>`)
        .join("");
      const actions = data.nextActions.length
        ? data.nextActions.map((action) => row(action.title, [pill(action.priority, action.priority === "now" ? "warning" : action.priority === "next" ? "active" : "neutral"), span(DESTINATIONS[action.navigationId] ?? action.navigationId)], action.reason)).join("\n")
        : empty("Nothing needs attention right now.");
      const notice = data.surface.cards.find((card) => card.kind === "notice");
      return `${header("Creator command center", data)}${alert}
<div class="metrics">${metrics}</div>
<section aria-label="Next actions"><h2>Your next best actions <span class="count">${data.nextActions.length}</span></h2><ul>${actions}</ul></section>
${notice ? `<p class="row-detail">${esc(notice.message)}</p>` : ""}`;
    }
    case "publish-queue": {
      const items = data.items.length ? data.items.map((item) => row(item.title, [pill(item.status, statusTone(item.status)), span(item.id, "mono"), ...(item.publishAt ? [span(`publishes ${item.publishAt}`)] : [])])).join("\n") : empty("The publish queue is empty.");
      return `${header("Publish queue", data)}${alert}<section aria-label="Publish queue"><h2>Queued <span class="count">${data.items.length}</span></h2><ul>${items}</ul></section>`;
    }
    case "content-calendar": {
      const slots = data.slots.length ? [...data.slots].sort((a, b) => a.date.localeCompare(b.date)).map((slot) => row(slot.title, [span(slot.date), span(slot.platform), pill(slot.status, statusTone(slot.status))])).join("\n") : empty("No calendar slots for this project.");
      return `${header("Content calendar", data)}${alert}<section aria-label="Calendar slots"><h2>Slots <span class="count">${data.slots.length}</span></h2><ul>${slots}</ul></section>`;
    }
    case "analytics": {
      const metric = (label: string, value: string | undefined) => `<div class="metric"><div class="metric-value">${esc(value ?? "—")}</div><div class="metric-label">${esc(label)}</div></div>`;
      const avd = data.metrics.averageViewDurationSeconds;
      const tone = data.diagnosis.kind === "healthy" ? "positive" : data.diagnosis.kind === "needs-data" ? "neutral" : "warning";
      return `${header("Creator analytics", data)}${alert}
<div class="metrics">${metric("CTR", data.metrics.ctr === null ? undefined : `${data.metrics.ctr}%`)}${metric("Views", data.metrics.views?.toLocaleString())}${metric("Avg view duration", avd === undefined ? undefined : `${Math.floor(avd / 60)}:${String(Math.round(avd % 60)).padStart(2, "0")}`)}</div>
<section aria-label="Diagnosis"><h2>Diagnosis</h2><ul>${row(data.diagnosis.title, [pill(data.diagnosis.kind, tone), span(DESTINATIONS[data.diagnosis.navigationId] ?? data.diagnosis.navigationId)], `${data.diagnosis.reason} Next: ${data.diagnosis.nextAction}.`)}</ul></section>`;
    }
    case "idea-ladder": {
      const stages = data.stages
        .map((stage) => `<section aria-label="${esc(stage.title)}"><h2>${esc(stage.title)} <span class="count">${stage.count}</span></h2><ul>${stage.items.length ? stage.items.map((item) => row(item.title, [span(item.id, "mono"), span(`Next: ${item.nextAction}`)])).join("\n") : empty("No ideas on this rung.")}</ul></section>`)
        .join("\n");
      return `${header("Idea ladder", data)}${alert}${stages}`;
    }
    case "sponsor-deal-room": {
      const deals = data.deals.length
        ? data.deals.map((deal) => row(deal.name, [pill(deal.status, statusTone(deal.status)), ...(deal.needsDisclosure ? [pill("needs disclosure", "warning")] : [])], deal.disclosure ? `Disclosure: ${deal.disclosure} · Next: ${deal.nextAction}` : `Next: ${deal.nextAction}`)).join("\n")
        : empty("No active sponsor deals.");
      return `${header("Sponsor deal room", data)}${alert}
<div class="metrics"><div class="metric"><div class="metric-value">${data.totals.active}</div><div class="metric-label">Active</div></div><div class="metric metric-${data.totals.needsDisclosure ? "warning" : "positive"}"><div class="metric-value">${data.totals.needsDisclosure}</div><div class="metric-label">Need disclosure</div></div><div class="metric"><div class="metric-value">${data.totals.delivered}</div><div class="metric-label">Delivered</div></div></div>
<section aria-label="Deals"><h2>Active deals</h2><ul>${deals}</ul></section>`;
    }
    case "package-review": {
      const checks = data.projectId ? data.checks.map((check) => row(check.label, [pill(check.status, statusTone(check.status)), span(DESTINATIONS[check.navigationId] ?? check.navigationId)], check.reason)).join("\n") : empty("No Creator projects yet.");
      return `${header("Package review", data)}${alert}
${data.projectTitle ? `<p class="subject">${esc(data.projectTitle)} <span class="mono">${esc(data.projectId)}</span></p>` : ""}${projectPicker(data.projects, data.projectId)}
<section aria-label="Publish checks"><h2>Publish checks</h2><ul>${checks}</ul></section>`;
    }
    case "video-readiness":
      return renderReadiness(data, options);
  }
}

const stepIcon: Record<CreatorWorkflowModel["steps"][number]["state"], string> = { pending: "○", active: "◐", completed: "●", blocked: "◌", failed: "✕" };

function renderReadiness(data: VideoReadinessData, options: { busy?: boolean; error?: string }): string {
  const { workflow } = data;
  const steps = workflow.steps
    .map((step) => `<li class="step step-${esc(step.state)}"><span class="step-icon" aria-hidden="true">${stepIcon[step.state]}</span><div><div class="row-title">${esc(step.title)}</div>${step.detail ? `<div class="row-detail">${esc(step.detail)}</div>` : ""}</div><span class="sr">${esc(step.state)}</span></li>`)
    .join("\n");
  const evidence = (workflow.evidence ?? []).map((item) => row(item.title, [pill(item.status, item.status)], item.detail)).join("\n");
  const actions = (workflow.actions ?? []).map((action) => `<button type="button" class="${action.tone === "primary" ? "primary" : ""}" data-action="${esc(action.id)}" ${options.busy ? "disabled" : ""}>${esc(action.title)}</button>`).join("");
  return `${header(workflow.title, data, "refresh")}
${data.projectTitle ? `<p class="subject">${esc(data.projectTitle)} <span class="mono">${esc(data.projectId)}</span> · stage <strong>${esc(workflow.currentStage)}</strong></p>` : `<p class="empty">No Creator projects to review.</p>`}
${projectPicker(data.projects, data.projectId)}
${data.published ? `<p class="notice" role="status">Video ${esc(data.published.status)}${data.published.publishAt ? ` for ${esc(data.published.publishAt)}` : ""}.</p>` : ""}
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ""}
<ol class="steps">${steps}</ol>
${evidence ? `<section aria-label="Evidence"><h2>Evidence</h2><ul>${evidence}</ul></section>` : ""}
${actions ? `<div class="actions">${actions}</div>` : ""}`;
}

export const STYLES = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #656d76; --bg: transparent; --line: #d0d7de; --accent: #0969da; --pos: #1a7f37; --neg: #cf222e; --warn: #9a6700; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
:root[data-theme="dark"] { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; --warn: #d29922; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #4493f8; --pos: #3fb950; --neg: #f85149; --warn: #d29922; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; color: var(--fg); background: var(--bg); }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 16px 0 6px; }
.header-meta { display: flex; gap: 8px; align-items: center; color: var(--muted); }
ul, ol { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.row-main { flex: 1; min-width: 0; } .row-title { font-weight: 500; overflow-wrap: anywhere; }
.row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; margin-top: 2px; }
.row-detail { color: var(--muted); font-size: 12px; margin-top: 2px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.count { font-weight: 400; } .empty { color: var(--muted); padding: 8px 0; border-top: 1px solid var(--line); }
.pill { border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 17px; }
.pill-active { color: var(--accent); } .pill-positive { color: var(--pos); } .pill-negative { color: var(--neg); } .pill-warning { color: var(--warn); } .pill-neutral, .pill-muted { color: var(--muted); }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-top: 12px; }
.metric { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; } .metric-value { font-size: 18px; font-weight: 600; } .metric-label { color: var(--muted); font-size: 12px; }
.metric-warning .metric-value { color: var(--warn); } .metric-positive .metric-value { color: var(--pos); }
button { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); } button:disabled { opacity: .5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
select { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; max-width: 100%; }
.steps { margin-top: 10px; } .step { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; }
.step-icon { width: 14px; text-align: center; color: var(--muted); } .step-active .step-icon { color: var(--accent); } .step-completed .step-icon { color: var(--pos); } .step-failed .step-icon { color: var(--neg); }
.step-pending .row-title { color: var(--muted); font-weight: 400; }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; flex-wrap: wrap; } .field { display: flex; gap: 6px; align-items: center; color: var(--muted); margin-top: 10px; }
.subject { margin: 6px 0 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.notice { color: var(--pos); } .error { color: var(--neg); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`;
